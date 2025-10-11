import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc-x'
import type { ServerInfo } from 'lms-discovery'

export default defineTask({
  meta: {
    name: 'squeezePlayersScanner',
    description: 'Discovers Squeeze players on the local network'
  },
  async run(_event) {
    await runSqueezePlayersScanner()
    return { result: 'ok' }
  }
})

/**
 * Scans for LMS (Lyrion / Logitech Media Server) players on the network and stores them in the DISCOVERY storage.
 */
export async function runSqueezePlayersScanner() {
  const logger = useLogger('squeezePlayersScanner')
  const storage = useStorage('DISCOVERY')
  logger.debug('Scanning for squeeze devices ..')
  await storage.getKeys('servers/').then(async (servers) => {
    if (!servers) {
      logger.debug('No LMS found in storage, skipping')
      return
    }

    for (const key of servers) {
      logger.debug(`Scanning LMS with key '${key}' ..`)
      const server = await storage.getItem<ServerInfo>(key)
      if (server) {
        logger.debug(`Looking for players from LMS '${server.name} (${server.ip})' ..`)
        const client = new SqueezeServerStub(`http://${server.ip}:${server.jsonPort || '9000'}`)
        const lms = new SqueezeServer(client)

        const playerInfos = await lms.getPlayerInfosAsync()
        if (playerInfos.length === 0) {
          logger.info(`No players found on LMS '${server.name}' (${server.ip})`)
        } else {
          logger.info(`Discovered ${playerInfos.length} player(s) on LMS '${server.name}' at ${server.ip}, storing player info`)
          await storage.setItem(`players/${server.uuid}`, playerInfos)
          logger.debug(`Stored player infos for LMS '${server.name}' (${server.ip})`)
        }
      }
    }
  })
}
