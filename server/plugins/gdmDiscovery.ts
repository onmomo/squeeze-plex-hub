import dgram from 'dgram'
import useLogger from '../composables/useLogger'
import { useScheduler } from '#scheduler'
import { plexOptions } from '~/server/lib/squeezePlexHub'

const broadcastAddress = '239.0.0.250'
const discoveryMessage = 'M-SEARCH * HTTP/1.1\r\n\r\n'
const discoveryPort = 32414

interface PlexServer {
  name: string
  address: string
  port: number
  protocol: string
}

const logger = useLogger('gdmAnnouncer')
const storage = useStorage('DISCOVERY')

export default defineNitroPlugin(() => {
  gdmDiscovery()
})

export interface PlexServerResponse {
  contentType: string
  host: string
  name: string
  port: number
  resourceIdentifier: string
  updatedAt: number
  version: string
  localAddress: string
}

/**
 * Looks for Plex servers on the network using GDM (Global Discovery and Management).
 * @returns List of Plex servers found on the network
 */
async function gdmDiscovery() {
  logger.debug('Starting GDM Discovery ...')

  const scheduler = useScheduler()
  scheduler
    .run(async () => {
      try {
        const discoverySocket = dgram.createSocket('udp4')

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
              `Found PLEX server '${plexServer.name}' at ${plexServer.localAddress}:${plexServer.port} (external: ${plexServer.host})`
            )
            await storage.setItem('plexServer', plexServer)
            discoverySocket.close()
            return
          }
        })

        setTimeout(() => {
          logger.info('GDM Discovery timeout. No response received within 15s, trying again later ..')
          discoverySocket.close()
        }, 150000)
      } catch (error) {
        logger.error('Error during GDM Discovery:', error)
      }
    })
    .everySeconds(30)
}

function parseServerResponse(response: string, localAddress: string): PlexServerResponse | null {
  const lines = response.split('\n')
  const result: Partial<PlexServerResponse> = {}
  result.localAddress = localAddress

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

  return null
}
