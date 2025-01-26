import { useScheduler } from '#scheduler'
import { ServerInfo } from 'lms-discovery'
import useLogger from '../composables/useLogger'

const logger = useLogger('squeezePlayersScanner')

export default defineNitroPlugin(() => {
  squeezePlayersScanner()
})

function squeezePlayersScanner() {
  const storage = useStorage('DISCOVERY')
  const scheduler = useScheduler()
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
            logger.info(`Looking for players from LMS ${server.name} (${server.ip}) ..`)
            // TODO get players from LMS and store them in storage
          }
          
        }
      })
    })
    .everySeconds(10)
}
