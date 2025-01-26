import { useScheduler } from '#scheduler'
import { ServerInfo } from 'lms-discovery'
import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc'
//import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('squeezePlayersScanner')

export default defineNitroPlugin(() => {
  squeezePlayersScanner()
})

/**
 * Scans for LMS (Logitech Media Server) players on the network and stores them in the DISCOVERY storage.
 */
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
            logger.debug(`Looking for players from LMS ${server.name} (${server.ip}) ..`)
            const client = new SqueezeServerStub(`http://${server.ip}:${server.jsonPort || '9000'}`)
            const squeeze = new SqueezeServer(client)
            const playerInfos = await squeeze.getPlayerInfosAsync()
            logger.info(`Found ${playerInfos.length} players on ${server.name} (${server.ip})`)
            await storage.setItem(`servers/${server.uuid}/players`, playerInfos)
            
            //const storedPlayerInfos = await storage.getItem<IPlayerInfo[]>(`servers/${server.uuid}/players`) || []
            //for (const storedPlayerInfo of storedPlayerInfos) {
            //  logger.info(`Stored Player: ${storedPlayerInfo.name} (${storedPlayerInfo.playerid})`)
            //}
          }
        }
      })
    })
    .everySeconds(10)
}
