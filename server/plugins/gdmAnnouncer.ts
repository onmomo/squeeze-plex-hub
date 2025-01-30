import dgram from 'dgram'
import { StringDecoder } from 'string_decoder'
import useLogger from '../composables/useLogger'
import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('gdmAnnouncer')
const storage = useStorage('DISCOVERY')
const serverPort = 3000 // nuxt server port

export default defineNitroPlugin(() => {
  gdmAnnouncer()
})

function gdmAnnouncer() {
  const decoder = new StringDecoder('utf8')
  const server = dgram.createSocket('udp4')

  server.on('listening', () => {
    server.addMembership('239.0.0.250')
    server.setMulticastTTL(5)
    logger.info('GDM Announcer is listening on port 32412')
  })

  server.on('message', async (msg, rinfo) => {
    const packetContent = decoder.write(msg).trim()
    if (packetContent.match(/M-SEARCH \* HTTP\/1\.[0-1]/)) {
      logger.info(`Received GDM discovery request from ${rinfo.address}:${rinfo.port}`)
      storage.getKeys('players/').then(async (serverKey) => {
        if (!serverKey) {
          logger.debug('No LMS found in storage, skipping')
          return
        }

        for (const key of serverKey) {
          const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
          if (playerInfos) {
            logger.info(`Announcing ${playerInfos.length} players from LMS ${key} to Plex ..`)
            for (const playerInfo of playerInfos) {
              const message = announceMessage(playerInfo.playerid, playerInfo.name, serverPort)
              server.send(message, 0, message.length, rinfo.port, rinfo.address)
            }
          }
        }
      })
    }
  })

  server.bind(32412) // Bind to a specific port
}

function appendParameter(sb: string[], key: string, value: string): void {
  sb.push(`${key}: ${value}\r\n`)
}

function announceMessage(playerId: string, name: string, port: number) {
  const sb = ['HTTP/1.0 200 OK\r\n']
  appendParameter(sb, 'Content-Type', 'plex/media-player')
  appendParameter(sb, 'Device-Class', 'stb')
  appendParameter(sb, 'Name', name)
  appendParameter(sb, 'Port', port.toString())
  appendParameter(sb, 'Product', 'SqueezePlexHub')
  appendParameter(sb, 'Version', '1.0.0') // TODO get version from package.json
  appendParameter(sb, 'Protocol', 'plex')
  appendParameter(sb, 'Protocol-Capabilities', 'timeline,playback,shoutcast')
  appendParameter(sb, 'Provides', 'player')
  appendParameter(sb, 'Protocol-Version', '1')
  appendParameter(sb, 'RawName', name)
  appendParameter(sb, 'Resource-Identifier', playerId)
  sb.push('\r\n')

  return sb.join('')
}
