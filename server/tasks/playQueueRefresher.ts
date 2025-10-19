/**
 * Nitro task that refreshes the Plex play queue for all Squeeze players.
 *
 * This task iterates through all discovered Squeeze players stored in the DISCOVERY storage,
 * checks for updates to their associated Plex play queues, and updates the queues if changes are detected.
 * If new tracks are found in the refreshed play queue, they are added to the player's playlist.
 *
 * Can be manually triggered in dev mode via: http://localhost:3000/_nitro/tasks/playQueueRefresher
 *
 * @returns An object indicating the result of the refresh operation.
 */
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import useLogger from '../composables/useLogger'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import { getPlayQueue, metadata, getPlexApiTrack } from '../lib/plexApi'
import type { PlayerPlayQueue } from '../lib/plexPlayerTimeline'
import type { TaskPayload } from 'nitropack'

export interface PlayQueueRefresherPayload extends TaskPayload {
  forceRefresh?: boolean
}

/**
 * Manually trigger the refresh: http://localhost:3000/_nitro/tasks/playQueueRefresher
 */
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

// Simple in-memory lock to prevent concurrent execution
let isRunning = false

export async function runPlayQueueRefresher() {
  if (isRunning) {
    // Optionally log or throw if you want to notify about concurrent attempts
    // TODO return some status about skipping due to already running
    return
  }
  isRunning = true
  const logger = useLogger('playQueueRefresher')
  const storage = useStorage('DISCOVERY')
  try {
    logger.info(`Refreshing Plex play queues for all Squeeze players ..`)

    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      logger.debug('No LMS found in storage, skipping')
      return
    }

    const allPlayers: [string, IPlayerInfo][] = []

    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      logger.debug(`Found ${playerInfos?.length || 0} players for server '${key}'`)
      const serverId = key.split(':')[1]
      if (playerInfos) {
        for (const player of playerInfos) {
          allPlayers.push([serverId, player])
        }
      }
    }

    await Promise.all(
      allPlayers.map(async ([_serverId, playerInfo]) => {
        const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
        if (!playerQueue) {
          logger.debug(`No playQueue available for player '${playerInfo.name}' (${playerInfo.playerid}), skipping refresh`)
          return
        }

        const playQueueId = playerQueue.playQueue.MediaContainer.$.playQueueID
        const refreshedPlayQueue = await getPlayQueue(playerQueue.plexServer, `/playQueues/${playQueueId}`)
        const refreshedPlayerQueue: PlayerPlayQueue = {
          playerId: playerInfo.playerid,
          playQueue: refreshedPlayQueue,
          plexServer: playerQueue.plexServer
        }

        logger.info(`Force refreshing playQueue '${playQueueId}' for player '${playerInfo.name}' (${playerInfo.playerid}) ..`)
        const { player } = await useSqueezePlayer(playerInfo.playerid)
        await player.clearPlaylist()
        for (const track of refreshedPlayQueue.MediaContainer.Track) {
          const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
          logger.info(
            `Adding track '${track.$.title}' / '${track.$.key}' (${track.$.playQueueItemID}) to refreshed playQueue for player '${playerInfo.name}' (${playerInfo.playerid}) ..`
          )
          await player.addToPlaylist(trackUrl, metadata(track))
        }

        await storage.setItem(`playerQueue/${playerInfo.playerid}`, refreshedPlayerQueue)
        logger.info(
          `Player '${playerInfo.name}' (${playerInfo.playerid}): playQueue '${playQueueId}' refreshed (old size: ${playerQueue.playQueue.MediaContainer.$.size}, refreshed size: ${refreshedPlayQueue.MediaContainer.$.size}).`
        )
        return
      })
    )
  } catch (error) {
    logger.error(`Error when refreshing play queues: ${error}`, error)
  } finally {
    isRunning = false
  }
}
