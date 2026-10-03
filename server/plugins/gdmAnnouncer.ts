import dgram from 'dgram'
import { StringDecoder } from 'string_decoder'
import useLogger from '../composables/useLogger'
import { plexOptions } from '../lib/squeezePlexHub'
import { resolvePlexTargets, type PlexTarget } from '../lib/plexTargets'
import { isDemoMode } from '../lib/demoMode'

// GDM network player discovery port
const gdmPlayerAnnouncerPort = 32412
const logger = useLogger('gdmAnnouncer')

export default defineNitroPlugin(() => {
  const { appVersion } = useRuntimeConfig()
  logger.info(`Squeeze Plex Hub version '${appVersion}' initialized. 🔊 ⏯️`)
  if (isDemoMode()) {
    logger.info('Demo mode, GDM announcer disabled')
    return
  }
  runGdmAnnouncer()
})

/**
 * Announces LMS players (see `resolvePlexTargets`) to Plex clients using GDM.
 */
export function runGdmAnnouncer() {
  const decoder = new StringDecoder('utf8')

  try {
    // Enable SO_REUSEPORT for multiple instances of the same service to bind to the same port
    // Essential that we can run multiple Plex clients or server next to Squeeze Plex Hub on the same host
    const server = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    server.on('listening', () => {
      try {
        server.addMembership('239.255.255.250')
        server.setMulticastTTL(5)
        server.setTTL(64)
        logger.info(`GDM Announcer is listening on port ${gdmPlayerAnnouncerPort} to announce LMS squeeze players ..`)
      } catch (error) {
        logger.warn('Error listening for gdm messages:', error)
      }
    })

    server.on('message', async (msg, rinfo) => {
      try {
        const packetContent = decoder.write(msg).trim()
        if (packetContent.match(/M-SEARCH \* HTTP\/1\.[0-1]/)) {
          logger.debug(`Received GDM discovery request from ${rinfo.address}:${rinfo.port}`)
          const targets = await resolvePlexTargets().catch(() => [])
          if (targets.length === 0) {
            logger.debug('No visible squeeze players found, skipping')
            return
          }

          logger.info(`Announcing '${targets.length}' players to Plex client '${rinfo.address}:${rinfo.port}' ..`)
          for (const target of targets) {
            logger.debug(`Announcing squeeze ${target.kind} '${target.name}' to Plex client '${rinfo.address}:${rinfo.port}' ..`)
            const message = announceMessage(target)
            server.send(message, 0, message.length, rinfo.port, rinfo.address)
          }
        }
      } catch (error) {
        logger.warn('Error processing received gdm message:', error)
      }
    })

    server.on('error', (err) => {
      logger.error('Error on gdm announcer:', err)
      server.close()
    })

    server.bind(gdmPlayerAnnouncerPort)
  } catch (error) {
    logger.error(
      `Failed to bind to GDM port ${gdmPlayerAnnouncerPort}. Squeeze Plex Hub cannot continue. Ensure the UDP port 32412 is available and not blocked by PMS itself or any other application. If PMS runs in Docker bridge mode, ensure that port 32412 is not mapped to PMS container, otherwise consider running Squeeze Plex Hub in host mode. Alternatively, move Squeeze Plex Hub to another host.`,
      error
    )
    process.exit(1)
  }
}

function appendParameter(sb: string[], key: string, value: string): void {
  sb.push(`${key}: ${value}\r\n`)
}

function announceMessage(target: PlexTarget) {
  const sb = ['HTTP/1.1 200 OK\r\n']
  appendParameter(sb, 'Content-Type', 'plex/media-player')
  appendParameter(sb, 'Device-Class', plexOptions.deviceClass)
  appendParameter(sb, 'Name', target.name)
  appendParameter(sb, 'Port', plexOptions.port.toString())
  appendParameter(sb, 'Product', plexOptions.product)
  appendParameter(sb, 'Version', plexOptions.version)
  appendParameter(sb, 'Protocol', plexOptions.protocol)
  appendParameter(sb, 'Protocol-Version', plexOptions.protocolVersion)
  appendParameter(sb, 'Protocol-Capabilities', plexOptions.protocolCapabilities)
  appendParameter(sb, 'Resource-Identifier', target.id)
  //appendParameter(sb, 'Provides', 'player')
  //appendParameter(sb, 'RawName', target.name)
  //appendParameter(sb, 'Device', plexOptions.device)
  //appendParameter(sb, 'Model', plexOptions.model)
  sb.push('\r\n')

  return sb.join('')
}
