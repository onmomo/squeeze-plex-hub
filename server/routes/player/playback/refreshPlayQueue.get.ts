import type { PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import useLogger from '../../../composables/useLogger'
import { getRequestHeader, getQuery, eventHandler, setResponseHeaders, sendNoContent } from 'h3'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import { getPlayQueue, getPlexApiTrack, metadata, responseHeaders } from '../../../lib/plexApi'

const logger = useLogger('playback.refreshPlayQueue')

/**
 * This will create a play queue on plex server and play it on the target player.
 */
export default eventHandler(async (event) => {
  const storage = useStorage('DISCOVERY')
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  const playQueueID = query.playQueueID as string

  if (!targetClientIdentifier || !clientIdentifier || !deviceName || !playQueueID) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) and playQueueID query parameter, got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) in request`,
        { status: 400 }
      )
    )
  }

  try {
    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier)
    logger.info(`Refreshing playQueue '${playQueueID}' for player '${playerInfo.name}' ..`)
    const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
    if (!playerQueue) {
      throw new Error(`No playerQueue available for player ${playerInfo.name} (${playerInfo.playerid}), skipping playQueue refresh ..`)
    }

    const refreshedPlayQueue = await getPlayQueue(playerQueue.plexServer, `/playQueues/${playQueueID}`)
    const refreshedPlayerQueue: PlayerPlayQueue = {
      playerId: playerInfo.playerid,
      playQueue: refreshedPlayQueue,
      plexServer: playerQueue.plexServer
    }

    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Could not get status from player '${playerInfo.name}', cannot refresh play queue`)
    }
    const currentPlaylistIndex = playerStatus?.playlist_cur_index
    const playlistTrackCount = playerStatus?.playlist_tracks

    logger.info(
      `Cleaning up existing playQueue in player '${playerInfo.name}' from index ${currentPlaylistIndex + 1} to ${playlistTrackCount} to prepare for playQueue refresh ..`
    )
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

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when refreshing play queue for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' play queue not available for refreshing, try again later`, { status: 404 })
    )
  }
})
