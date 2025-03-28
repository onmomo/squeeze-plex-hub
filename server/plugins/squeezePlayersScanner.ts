import { useScheduler } from '#scheduler'
import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'

const logger = useLogger('squeezePlayersScanner')
const storage = useStorage('DISCOVERY')
const scheduler = useScheduler()

export default defineNitroPlugin(() => {
  squeezePlayersScanner()
})

/**
 * Scans for LMS (Logitech Media Server) players on the network and stores them in the DISCOVERY storage.
 */
function squeezePlayersScanner() {
  scheduler
    .run(() => {
      logger.debug('Scanning for squeeze devices ..')
      storage.getKeys('servers/').then(async (servers) => {
        if (!servers) {
          logger.debug('No LMS found in storage, skipping')
          return
        }

        for (const key of servers) {
          const server = await storage.getItem<ServerInfo>(key)
          if (server) {
            logger.debug(`Looking for players from LMS '${server.name} (${server.ip})' ..`)
            const client = new SqueezeServerStub(`http://${server.ip}:${server.jsonPort || '9000'}`)
            const squeeze = new SqueezeServer(client)

            const playerInfos = await squeeze.getPlayerInfosAsync()
            logger.info(`Found '${playerInfos.length}' squeeze players on LMS '${server.name} (${server.ip})'`)
            await storage.setItem(`players/${server.uuid}`, playerInfos)
          }
        }
      })
    })
    .everySeconds(10)
}
