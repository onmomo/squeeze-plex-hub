import dgram from 'dgram'
import type { AxiosError } from 'axios'
import axios from 'axios'
import useLogger from '../composables/useLogger'

const broadcastAddress = '239.255.255.250'
const discoveryMessage = 'M-SEARCH * HTTP/1.1\r\n\r\n'
// needs to broadcast on this port to receive a response from plex servers in the local network
const pmsDiscoveryPort = 32414
// how long we keep listening for responses - every Plex server on the network answers the same broadcast,
// so we must not stop at the first one. Stays well below the one minute task schedule so sockets never overlap.
const discoveryWindowMs = 10000
// one storage entry per Plex server, keyed by its resource identifier - see `servers/{serverId}` for the LMS equivalent
const plexServersKeyPrefix = 'plexServers/'

/**
 * Task to discover Plex servers on the local network using GDM (Global Discovery and Management) protocol.
 * This code is actually not required to allow Plex clients to discover the squeeze players bridge by Squeeze Plex Hub.
 * But I leave it here as documentation source on how to implement Plex server discovery via GDM.
 * It might be useful in future to leverage the Plex API from Squeeze Plex Hub independently.
 */
export default defineTask({
  meta: {
    name: 'gdmDiscovery',
    description: 'Discovers Plex servers on the local network using GDM'
  },
  async run(_event) {
    await runGdmDiscovery()
    return { result: 'ok' }
  }
})

export interface PlexServerResponse {
  protocol: string
  contentType?: string
  host?: string
  name?: string
  port: number
  resourceIdentifier: string
  updatedAt?: number
  version?: string
  localAddress: string
  secureAddress?: string
  secureProtocol?: string
}

/**
 * Discovers Plex servers on the local network using GDM (Global Discovery and Management) protocol.
 * Sends a UDP broadcast and parses the responses of every Plex server that answers within the discovery window.
 * Reachable servers are stored under `plexServers/{resourceIdentifier}`, servers that no longer answer or are
 * no longer reachable are removed again, so the storage always reflects the currently usable Plex servers.
 * @returns Promise that resolves once the discovery window is over and all responses have been processed.
 */
export async function runGdmDiscovery(): Promise<void> {
  const logger = useLogger('gdmDiscovery')
  const storage = useStorage('DISCOVERY')
  logger.info('Starting GDM Plex server discovery ...')

  return new Promise<void>((resolve) => {
    // resource identifiers we already handled in this run, a server may answer the broadcast more than once
    const respondedServerIds = new Set<string>()
    // resource identifiers we verified and stored in this run, everything else gets pruned from storage
    const reachableServerIds = new Set<string>()
    // responses are processed asynchronously, keep track of them so we only finish once they are all done
    const pendingResponses: Promise<void>[] = []

    let closed = false
    let finished = false
    let discoveryTimeout: NodeJS.Timeout | undefined
    let discoverySocket: dgram.Socket

    try {
      // Enable SO_REUSEPORT for multiple instances of the same service to bind to the same port
      discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    } catch (error) {
      logger.error('Error during GDM Discovery:', error)
      resolve()
      return
    }

    /**
     * Wraps up the discovery run once the socket is closed: awaits the responses still being verified,
     * prunes servers that are gone and resolves the task. Idempotent, the socket may close more than once.
     */
    const finish = () => {
      if (finished) return
      finished = true
      Promise.allSettled(pendingResponses)
        .then(() => pruneUnreachablePlexServers(reachableServerIds))
        .catch((error) => logger.error('Error while finishing GDM Discovery:', error))
        .finally(() => resolve())
    }

    /**
     * Closing must be idempotent: multiple Plex servers answer the same broadcast and the timeout as well as
     * the error handlers may close the socket too. dgram throws ERR_SOCKET_DGRAM_NOT_RUNNING on a second close,
     * which previously crashed the process as soon as more than one Plex server was on the network.
     */
    const closeSocketOnce = () => {
      if (closed) return
      closed = true
      clearTimeout(discoveryTimeout)
      discoveryTimeout = undefined
      try {
        discoverySocket.close()
      } catch (error) {
        logger.warn('GDM Discovery socket was already closed:', error)
        // no 'close' event to expect anymore, wrap up right away
        finish()
      }
    }

    discoverySocket.on('close', finish)

    discoverySocket.on('error', (err) => {
      logger.error('Error on GDM Discovery:', err)
      closeSocketOnce()
    })

    discoverySocket.on('message', (msg, rinfo) => {
      const responseData = msg.toString()
      if (!responseData.includes('HTTP/1.0 200 OK')) {
        return
      }

      const plexServer = parseServerResponse(responseData, rinfo.address)
      if (!plexServer || plexServer.contentType !== 'plex/media-server') {
        logger.warn('Unexpected GDM Discovery response:', responseData)
        return
      }
      if (respondedServerIds.has(plexServer.resourceIdentifier)) {
        logger.debug(`PLEX server '${plexServer.name}' already handled in this discovery run, skipping duplicate response`)
        return
      }
      respondedServerIds.add(plexServer.resourceIdentifier)

      logger.info(`Discovered PLEX server '${plexServer.name}' at ${plexServer.localAddress}:${plexServer.port} (host: ${plexServer.host})`)
      // keep listening, further Plex servers on the network may still answer the broadcast
      pendingResponses.push(storeReachablePlexServer(plexServer))
    })

    /**
     * Verifies that the discovered Plex server is reachable and stores it, otherwise it is skipped.
     */
    const storeReachablePlexServer = async (plexServer: PlexServerResponse): Promise<void> => {
      // Verify connectivity to the Plex server
      const verifyUrl = `${plexServer.protocol}://${plexServer.localAddress}:${plexServer.port}/identity`
      // Plexamp will provide the secure address (192-168-1-5.ztea2cf712e03f2b540150acfe3a4b.plex.direct) along the squeeze player requests,
      // so we need to ensure it is reachable as well to prevent connectivity issues later on when the secure address is used for streaming or talking to the Plex server API.
      const verifySecureUrl = `${plexServer.secureProtocol}://${plexServer.secureAddress}:${plexServer.port}/identity`
      try {
        await verifyPlexServerConnectivity(verifyUrl)
        await verifyPlexServerConnectivity(verifySecureUrl)
        await storage.setItem(`${plexServersKeyPrefix}${plexServer.resourceIdentifier}`, plexServer)
        reachableServerIds.add(plexServer.resourceIdentifier)
      } catch (error) {
        // Skip storing this server since it does not appear to be reachable, but log the error for debugging purposes
        logger.error(error)
      }
    }

    /**
     * Removes previously discovered Plex servers that did not answer this run or are no longer reachable.
     */
    const pruneUnreachablePlexServers = async (currentServerIds: Set<string>): Promise<void> => {
      const storedKeys = await storage.getKeys(plexServersKeyPrefix)
      for (const key of storedKeys) {
        const resourceIdentifier = key.split(':').pop()
        if (resourceIdentifier && !currentServerIds.has(resourceIdentifier)) {
          logger.info(`PLEX server '${resourceIdentifier}' is gone or no longer reachable, removing it from storage`)
          await storage.removeItem(key)
        }
      }
      logger.info(`GDM Discovery finished, ${currentServerIds.size} reachable PLEX server(s) available`)
    }

    discoverySocket.bind(() => {
      discoverySocket.setBroadcast(true)
    })

    const messageBuffer = Buffer.from(discoveryMessage)
    discoverySocket.send(messageBuffer, 0, messageBuffer.length, pmsDiscoveryPort, broadcastAddress, (err) => {
      if (err) {
        logger.error('Error sending discovery packet:', err)
        closeSocketOnce()
      }
    })

    discoveryTimeout = setTimeout(() => {
      if (respondedServerIds.size === 0) {
        logger.info(`GDM Discovery no response received within ${discoveryWindowMs / 1000}s, trying again later ..`)
      }
      closeSocketOnce()
    }, discoveryWindowMs)
  })
}

export async function verifyPlexServerConnectivity(verifyUrl: string): Promise<void> {
  const logger = useLogger('gdmDiscovery')
  try {
    logger.debug(`Verifying connectivity to PMS at ${verifyUrl}`)
    await axios.get(verifyUrl, {
      timeout: 3000
    })

    logger.info(`Successfully verified connectivity to PMS@'${verifyUrl}' - PMS is reachable and ready to be used with Squeeze Plex Hub.`)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError: AxiosError = error
      logger.error(
        `Failed to verify connectivity to PMS at ${verifyUrl}. Squeeze Plex Hub won't be able to stream. For *.plex.direct urls, ensure DNS resolution is working correctly: ${axiosError.message}`,
        {
          code: axiosError.code,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText
        }
      )
    } else {
      logger.error(`Unexpected error while connecting to PMS, failed to verify connectivity to PMS at ${verifyUrl}:`, error)
    }
    throw error
  }
}

export function parseServerResponse(response: string, localAddress: string): PlexServerResponse | undefined {
  const lines = response.split('\n')
  const result: Partial<PlexServerResponse> = {}
  result.localAddress = localAddress
  result.protocol = 'http' // we only get the local address here, so we assume http

  for (const line of lines) {
    const cleanLine = line.trim().replace(/,$/, '') // Remove trailing comma
    if (!cleanLine || !cleanLine.includes(':')) continue

    const [key, value] = cleanLine.split(':').map((part) => part.trim())

    switch (key) {
      case 'Content-Type':
        result.contentType = value
        break
      case 'Host':
        result.host = value
        result.secureAddress = localAddress.replace(/\./g, '-') + '.' + result.host
        result.secureProtocol = 'https'
        break
      case 'Name':
        result.name = value
        break
      case 'Port':
        result.port = Number(value)
        break
      case 'Resource-Identifier':
        result.resourceIdentifier = value
        break
      case 'Updated-At':
        result.updatedAt = Number(value)
        break
      case 'Version':
        result.version = value
        break
    }
  }

  if (
    result.contentType &&
    result.host &&
    result.name &&
    typeof result.port === 'number' &&
    result.resourceIdentifier &&
    typeof result.updatedAt === 'number' &&
    result.version &&
    result.localAddress
  ) {
    return result as PlexServerResponse
  }

  return undefined
}
