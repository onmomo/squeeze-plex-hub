import { useScheduler } from '#scheduler'
import { ServerInfo } from 'lms-discovery'
import useLogger from '../composables/useLogger'
import SqueezeServer from 'squeezenode'

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
            const squeeze = new SqueezeServer(`http://${server.ip}`, server.jsonPort || '9000')
            squeeze.getPlayers((reply: any) => {
              if (reply.ok) {
                logger.info(JSON.stringify(reply.result))
                for (const player of reply.result) {
                  logger.info(`Player found: ${player.name} (${player.ip})`)
                  storage.setItem(`players/${player.uuid}`, player)
                }
              } else {
                logger.error('Error getting players:', reply)
              }
            })
          }
        }
      })
    })
    .everySeconds(10)
}
