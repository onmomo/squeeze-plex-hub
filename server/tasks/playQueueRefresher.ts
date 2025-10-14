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

/**
 * Checks for Plex (PMS) play queue updates and stores them in the DISCOVERY storage.
 */
export async function runPlayQueueRefresher() {
  const logger = useLogger('playQueueRefresher')
  const storage = useStorage('DISCOVERY')
  try {
    logger.info('Refreshing Plex play queues for all Squeeze players ..')

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
      allPlayers.map(async ([_serverId, playerInfo]) => {
        const { player } = await useSqueezePlayer(playerInfo.playerid)

        const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
        if (!playerQueue) {
          logger.info(`No playQueue available for player ${playerInfo.playerid}, skipping refresh`)
          return
        }

        const playQueueId = playerQueue.playQueue.MediaContainer.$.playQueueID

        logger.info(`Refreshing playQueue '${playQueueId}' of player ${playerInfo.playerid} ..`)
        const refreshedPlayQueue = await getPlayQueue(playerQueue.plexServer, `/playQueues/${playQueueId}`)
        const refreshedPlayerQueue: PlayerPlayQueue = {
          playerId: playerInfo.playerid,
          playQueue: refreshedPlayQueue,
          plexServer: playerQueue.plexServer
        }

        if (refreshedPlayQueue.MediaContainer.$.size === playerQueue.playQueue.MediaContainer.$.size) {
          logger.info(
            `PlayQueue '${playQueueId}' of player ${playerInfo.playerid} has not changed in size (${refreshedPlayQueue.MediaContainer.$.size} items), skipping`
          )
          return
        }

        const updatedTrackQueue = refreshedPlayQueue.MediaContainer.Track.slice(Number(playerQueue.playQueue.MediaContainer.$.size))
        for (const track of updatedTrackQueue) {
          logger.info(`Adding track '${track.$.title}' / '${track.$.key}' to refreshed playQueue for player '${playerInfo.name}' ..`)
          const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
          await player.addToPlaylist(trackUrl, metadata(track))
        }

        await storage.setItem(`playerQueue/${playerInfo.playerid}`, refreshedPlayerQueue)

        logger.info(
          `Player '${playerInfo.name}' (${playerInfo.playerid}): playQueue '${playQueueId}' size changed from '${playerQueue.playQueue.MediaContainer.$.size}' to '${refreshedPlayQueue.MediaContainer.$.size}' tracks.`
        )
      })
    )
  } catch (error) {
    logger.error(`Error when refreshing play queues ${error}`, error)
  }
}
