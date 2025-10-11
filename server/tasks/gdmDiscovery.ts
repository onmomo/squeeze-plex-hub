import dgram from 'dgram'
import useLogger from '../composables/useLogger'

const broadcastAddress = '239.255.255.250'
const discoveryMessage = 'M-SEARCH * HTTP/1.1\r\n\r\n'
// needs to broadcast on this port to receive a response from plex servers in the local network
const discoveryPort = 32414

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
  relayAddress?: string
  relayProtocol?: string
}

/**
 * Discovers Plex servers on the local network using GDM (Global Discovery and Management) protocol.
 * Sends a UDP broadcast and parses responses from Plex servers.
 * @returns Promise that resolves to a list of discovered PlexServerResponse objects.
 */
async function runGdmDiscovery() {
  const logger = useLogger('gdmDiscovery')
  const storage = useStorage('DISCOVERY')
  logger.info('Starting GDM Plex server discovery ...')
  try {
    // Enable SO_REUSEPORT for multiple instances of the same service to bind to the same port
    const discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    discoverySocket.bind(() => {
      discoverySocket.setBroadcast(true)
    })

    const messageBuffer = Buffer.from(discoveryMessage)
    discoverySocket.send(messageBuffer, 0, messageBuffer.length, discoveryPort, broadcastAddress, (err) => {
      if (err) {
        logger.error('Error sending discovery packet:', err)
        discoverySocket.close()
        return
      }
    })

    discoverySocket.on('message', async (msg, rinfo) => {
      const responseData = msg.toString()
      if (responseData.includes('HTTP/1.0 200 OK')) {
        const plexServer = parseServerResponse(responseData, rinfo.address)
        if (!plexServer || plexServer.contentType !== 'plex/media-server') {
          logger.warn('Unexpected GDM Discovery response:', responseData)
          return
        }
        logger.info(
          `Discovered PLEX server '${plexServer.name}' at ${plexServer.localAddress}:${plexServer.port} (host: ${plexServer.host})`
        )
        await storage.setItem(`plexServer`, plexServer)
        discoverySocket.close()
      }
    })

    discoverySocket.on('error', (err) => {
      logger.error('Error on GDM Discovery:', err)
      discoverySocket.close()
    })
    setTimeout(() => {
      logger.info('GDM Discovery no response received within 30s, trying again later ..')
      discoverySocket.close()
    }, 300000)
  } catch (error) {
    logger.error('Error during GDM Discovery:', error)
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
        result.relayAddress = localAddress.replace(/\./g, '-') + '.' + value
        result.relayProtocol = 'https'
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
