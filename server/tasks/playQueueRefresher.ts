import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc-x'
import type { ServerInfo } from 'lms-discovery'

export default defineTask({
  meta: {
    name: 'playQueueRefresher',
    description: 'Refreshes the Plex play queue for all Squeeze players'
  },
  async run(_event) {
    await runPlayQueueRefresher()
    return { result: 'ok' }
  }
})

/**
 * Checks for Plex (PMS) play queue updates and stores them in the DISCOVERY storage.
 */
export async function runPlayQueueRefresher() {
  const logger = useLogger('playQueueRefresher')
  const storage = useStorage('DISCOVERY')
  try {
    logger.debug('Refreshing Plex play queues for all Squeeze players ..')

    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      logger.debug('No LMS found in storage, skipping')
      return
    }

    const allPlayers: [string, IPlayerInfo][] = [] // Array of tuples (serverId, IPlayerInfo)

    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      logger.debug(`Found ${playerInfos?.length || 0} players for server '${key}'`)
      const serverId = key.split(':')[1] // e.g. players:de443cee-943b-421a-8db3-575e5b4cddc6 where the later is the serverId
      if (playerInfos) {
        for (const player of playerInfos) {
          allPlayers.push([serverId, player])
        }
      }
    }

    await Promise.all(
      allPlayers.map(async ([serverId, playerInfo]) => {
        // resolve player status and send timeline to all subscribers
        logger.debug(`Publishing timeline to ${playerSubscribers.length} subscribers for player ${playerInfo.playerid} ..`)
        const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
        if (!serverInfo || !serverInfo.ip) {
          throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
        }
        const { player } = await useSqueezePlayer(playerInfo.playerid)

        const playerStatus = await player.status()
        if (!playerStatus) {
          throw new Error(`Player ${playerInfo.playerid} status available yet`)
        }

        const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
        if (!playerQueue) {
          logger.debug(`No playerQueue available for player ${playerInfo.playerid}, skipping play queue update`)
          return
        }
      })
    )
  } catch (error) {
    logger.error(`Error when updating player play queues`, error)
  }
}
