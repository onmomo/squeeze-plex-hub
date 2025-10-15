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
      const serverId = key.split(':')[1]
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

        // Build a set of existing track IDs from the current queue
        const existingTrackIds = new Set(playerQueue.playQueue.MediaContainer.Track.map((track) => track.$.playQueueItemID))

        // Find new tracks in the refreshed queue that aren't in the current queue
        const newTracks = refreshedPlayQueue.MediaContainer.Track.filter((track) => !existingTrackIds.has(track.$.playQueueItemID))

        if (newTracks.length === 0) {
          logger.info(`PlayQueue '${playQueueId}' of player '${playerInfo.name}' (${playerInfo.playerid}) has no new tracks, skipping`)
          return
        }

        logger.info(
          `PlayQueue '${playQueueId}' of player '${playerInfo.name}' (${playerInfo.playerid}): found ${newTracks.length} new track(s) to add (old size: ${playerQueue.playQueue.MediaContainer.$.size}, new size: ${refreshedPlayQueue.MediaContainer.$.size})`
        )
        // Remove tracks that are no longer in the refreshed queue from the player's playlist
        const refreshedTrackIds = new Set(refreshedPlayQueue.MediaContainer.Track.map((track) => track.$.playQueueItemID))

        const removedTracks = playerQueue.playQueue.MediaContainer.Track.filter((track) => !refreshedTrackIds.has(track.$.playQueueItemID))

        for (const track of removedTracks) {
          logger.info(
            `Removing track '${track.$.title} - ${track.$.parentTitle}' / '${track.$.key}' from playlist for player '${playerInfo.name}' (${playerInfo.playerid}) ..`
          )
          const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
          await player.deleteFromPlaylist(trackUrl)
        }

        for (const track of newTracks) {
          logger.info(
            `Adding track '${track.$.title}' / '${track.$.key}' to refreshed playQueue for player '${playerInfo.name}' (${playerInfo.playerid}) ..`
          )
          const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
          await player.addToPlaylist(trackUrl, metadata(track))
        }

        await storage.setItem(`playerQueue/${playerInfo.playerid}`, refreshedPlayerQueue)

        refreshedPlayQueue.MediaContainer.Track.forEach((track, idx) => {
          logger.info(
            `[${idx}] ${track.$.title} - ${track.$.parentTitle} (key: ${track.$.key}, playQueueItemID: ${track.$.playQueueItemID}), playQueue '${playQueueId}', player '${playerInfo.name}' (${playerInfo.playerid})`
          )
        })

        logger.info(
          `Player '${playerInfo.name}' (${playerInfo.playerid}): playQueue '${playQueueId}' refreshed (old size: ${playerQueue.playQueue.MediaContainer.$.size}, new size: ${refreshedPlayQueue.MediaContainer.$.size}, added: ${newTracks.length} tracks).`
        )
      })
    )
  } catch (error) {
    logger.error(`Error when refreshing play queues ${error}`, error)
  }
}
