import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import useLogger from '../composables/useLogger'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import { getPlayQueue, metadata, getPlexApiTrack } from '../lib/plexApi'
import type { PlayerPlayQueue } from '../lib/plexPlayerTimeline'

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

        // check if the playQueue has changed in size
        if (refreshedPlayQueue.MediaContainer.$.size === playerQueue.playQueue.MediaContainer.$.size) {
          logger.info(
            `PlayQueue '${playQueueId}' of player ${playerInfo.playerid} has not changed in size (${refreshedPlayQueue.MediaContainer.$.size} items), skipping`
          )
          return
        }

        //logger.info(JSON.stringify(refreshedPlayQueue))

        const playerStatus = await player.status()
        if (!playerStatus) {
          throw new Error(`Could not get status from player '${playerInfo.name}', cannot refresh play queue`)
        }
        const currentPlaylistIndex = playerStatus?.playlist_cur_index
        const playlistTrackCount = playerStatus?.playlist_tracks

        logger.info(
          `Cleaning up existing playQueue in player '${playerInfo.name}' from index ${currentPlaylistIndex + 1} to ${playlistTrackCount} to prepare for playQueue refresh ..`
        )

        // TODO is this necessary in this case or can we just add the missing tracks to the end of the queue?
        for (let trackIndex = playlistTrackCount - 1; trackIndex > currentPlaylistIndex; trackIndex--) {
          await player.deleteTrackFromPlaylist(trackIndex)
        }

        const selectedOffset = Number(refreshedPlayQueue.MediaContainer.$.playQueueSelectedItemOffset)
        const tracks = refreshedPlayQueue.MediaContainer.Track.slice(selectedOffset + 1)
        for (const track of tracks) {
          logger.info(`Adding track '${track.$.title}' to refreshed playQueue for player '${playerInfo.name}' ..`)
          const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
          await player.addToPlaylist(trackUrl, metadata(track))
        }

        await storage.setItem(`playerQueue/${playerInfo.playerid}`, refreshedPlayerQueue)

        logger.info(
          `Refreshed playQueue '${playQueueId}' of player ${playerInfo.playerid}, now has ${refreshedPlayQueue.MediaContainer.$.size} items`
        )
      })
    )
  } catch (error) {
    logger.error(`Error when refreshing player play queues`, error)
  }
}
