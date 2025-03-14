import dgram from 'dgram'
import { StringDecoder } from 'string_decoder'
import useLogger from '../composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('gdmAnnouncer')
const storage = useStorage('DISCOVERY')
// Needs to listen on this port for discovery requests from plex clients in the local network
const gdmAnnouncerPort = 32412

export default defineNitroPlugin(() => {
  // Since other devices may also want to announce on this port, we should not block it? Or how should that work if multiple devices want to announce on the same port? Like having plex client and plexamp running on the same machine?
  gdmAnnouncer()
})

/**
 * Announces LMS players to Plex clients using GDM.
 */
function gdmAnnouncer() {
  try {
    const decoder = new StringDecoder('utf8')
    const server = dgram.createSocket('udp4')

    server.on('listening', () => {
      try {
      server.addMembership('239.0.0.250')
      server.setMulticastTTL(5)
      logger.info(`GDM Announcer is listening on port ${gdmAnnouncerPort} to announce LMS squeeze players ..`)
    } catch (error) {
      logger.warn('Error listening for gdm messages:', error)
    }
    })

    server.on('message', async (msg, rinfo) => {
      try {
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
                logger.debug(`Announcing '${playerInfos.length}' players from LMS '${key}' to Plex client '${rinfo.address}:${rinfo.port}' ..`)
                for (const playerInfo of playerInfos) {
                  logger.info(
                    `Announcing squeeze player '${playerInfo.name}' from LMS '${key}' to Plex client '${rinfo.address}:${rinfo.port}' ..`
                  )
                  const message = announceMessage(playerInfo)
                  server.send(message, 0, message.length, rinfo.port, rinfo.address)
                }
              }
            }
          })
        }
      } catch (error) {
        logger.warn('Error processing received gdm message:', error)
      }
    })

    server.on('error', (err) => {
      logger.error('Error on gdm announcer:', err)
      server.close()
    });

    server.bind(gdmAnnouncerPort) 
  } catch (error) {
    logger.warn(`Error announcing squeeze players on port ${gdmAnnouncerPort}:`, error)        
  }
}

function appendParameter(sb: string[], key: string, value: string): void {
  sb.push(`${key}: ${value}\r\n`)
}

function announceMessage(player: IPlayerInfo) {
  const sb = ['HTTP/1.1 200 OK\r\n']
  appendParameter(sb, 'Content-Type', 'plex/media-player')
  appendParameter(sb, 'Device-Class', plexOptions.deviceClass)
  appendParameter(sb, 'Name', player.name)
  //appendParameter(sb, 'RawName', player.name)
  appendParameter(sb, 'Port', plexOptions.port)
  appendParameter(sb, 'Product', plexOptions.product)
  appendParameter(sb, 'Version', plexOptions.version)
  //appendParameter(sb, 'Device', plexOptions.device)
  //appendParameter(sb, 'Model', plexOptions.model)
  appendParameter(sb, 'Protocol', plexOptions.protocol)
  appendParameter(sb, 'Protocol-Version', plexOptions.protocolVersion)  
  appendParameter(sb, 'Protocol-Capabilities', plexOptions.protocolCapabilities)
  //appendParameter(sb, 'Provides', 'player')  
  appendParameter(sb, 'Resource-Identifier', player.playerid)
  sb.push('\r\n')

  return sb.join('')
}
