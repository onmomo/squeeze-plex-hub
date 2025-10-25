import useLogger from '../composables/useLogger'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import { getPlayQueue, metadata, getPlexApiTrack } from '../lib/plexApi'
import type { PlayerPlayQueue } from '../lib/plexPlayerTimeline'
import type { TaskPayload } from 'nitropack'
import usePlayerInfo from '../composables/usePlayerInfo'

export interface PlayQueueRefresherPayload extends TaskPayload {
  playerIdentifier: string // playerid or clientIdentifier
}

export default defineTask({
  meta: {
    name: 'playQueueRefresher',
    description: 'Refreshes the Plex play queue for a specific Squeeze player'
  },
  async run(event) {
    const payload = event.payload as PlayQueueRefresherPayload
    const refreshedPlayerQueue = await runPlayQueueRefresher(payload)
    return { result: refreshedPlayerQueue }
  }
})

export async function runPlayQueueRefresher(payload: PlayQueueRefresherPayload) {
  const { playerIdentifier } = payload
  if (!playerIdentifier) {
    return undefined
  }
  const logger = useLogger('playQueueRefresher')
  const storage = useStorage('DISCOVERY')
  try {
    logger.debug(`Refreshing Plex play queue task for player '${playerIdentifier}' ..`)

    const { playerInfo } = await usePlayerInfo(playerIdentifier)
    const { player } = await useSqueezePlayer(playerIdentifier)
    
    const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
    if (!playerQueue) {
      logger.info(`No playQueue available for player '${playerInfo.name}' (${playerInfo.playerid}), skipping refresh`)
      return undefined
    }

    const playQueueId = playerQueue.playQueue.MediaContainer.$.playQueueID
    const refreshedPlayQueue = await getPlayQueue(playerQueue.plexServer, `/playQueues/${playQueueId}`)
    const refreshedPlayerQueue: PlayerPlayQueue = {
      playerId: playerInfo.playerid,
      playQueue: refreshedPlayQueue,
      plexServer: playerQueue.plexServer
    }

    logger.info(`Force refreshing playQueue '${playQueueId}' for player '${playerInfo.name}' (${playerInfo.playerid}) ..`)
    await player.clearPlaylist()
    for (const track of refreshedPlayQueue.MediaContainer.Track) {
      const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
      logger.info(
        `Adding track '${track.$.title}' / '${track.$.key}' (${track.$.playQueueItemID}) to refreshed playQueue for player '${playerInfo.name}' (${playerInfo.playerid}) ..`
      )
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    await storage.setItem(`playerQueue/${playerInfo.playerid}`, refreshedPlayerQueue)
    // Note: The playQueueSelectedItemID and playQueueSelectedItemOffset may not always match the current state of the tracks in the playlist. Seems like a bug on PMS side.
    // Therefore we do not select tracks based on these values since it will randomly fail. The caller should handle track selection based on the tracks array index in the refreshed queue.
    logger.info(
      `Player '${playerInfo.name}' (${playerInfo.playerid}): playQueue '${playQueueId}' refreshed (old size: ${playerQueue.playQueue.MediaContainer.$.size}, refreshed size: ${refreshedPlayQueue.MediaContainer.$.size}, selected item / index offset: ${refreshedPlayQueue.MediaContainer.$.playQueueSelectedItemID} / ${refreshedPlayQueue.MediaContainer.$.playQueueSelectedItemOffset}).`
    )
    return refreshedPlayerQueue
  } catch (error) {
    logger.error(`Error when refreshing play queue: ${error}`, error)
    return undefined
  }
}
