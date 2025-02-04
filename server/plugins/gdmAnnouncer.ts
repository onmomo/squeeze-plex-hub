import dgram from 'dgram'
import { StringDecoder } from 'string_decoder'
import useLogger from '../composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'
import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('gdmAnnouncer')
const storage = useStorage('DISCOVERY')

export default defineNitroPlugin(() => {
  gdmAnnouncer()
})

/**
 * Announces LMS players to Plex clients using GDM.
 */
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
      logger.debug(`Received GDM discovery request from ${rinfo.address}:${rinfo.port}`)
      storage.getKeys('players/').then(async (serverKey) => {
        if (!serverKey) {
          logger.debug('No LMS found in storage, skipping')
          return
        }

        for (const key of serverKey) {
          const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
          if (playerInfos) {
            logger.debug(`Announcing ${playerInfos.length} players from LMS ${key} to Plex device ${rinfo.address}:${rinfo.port} ..`)
            for (const playerInfo of playerInfos) {
             logger.info(`Announcing squeeze player ${playerInfo.playerid} from LMS ${key} to Plex device ${rinfo.address}:${rinfo.port} ..`)
              const message = announceMessage(playerInfo)
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

function announceMessage(player :IPlayerInfo) {
  const sb = ['HTTP/1.1 200 OK\r\n']
  appendParameter(sb, 'Content-Type', 'plex/media-player')
  appendParameter(sb, 'Device-Class', 'stb')
  appendParameter(sb, 'Name', player.name)
  appendParameter(sb, 'Host', 'localhost')
  appendParameter(sb, 'Address', 'localhost')
  appendParameter(sb, 'Port', plexOptions.port)
  appendParameter(sb, 'Product', plexOptions.product)
  appendParameter(sb, 'Version', plexOptions.version)
  appendParameter(sb, 'Protocol', 'plex')
  appendParameter(sb, 'Protocol-Capabilities', 'timeline,playback,playqueues,playqueues-creation')
  appendParameter(sb, 'Provides', 'player')
  appendParameter(sb, 'Protocol-Version', '1')
  appendParameter(sb, 'RawName', player.name)
  appendParameter(sb, 'Resource-Identifier', player.playerid)  
  sb.push('\r\n')

  return sb.join('')
}
