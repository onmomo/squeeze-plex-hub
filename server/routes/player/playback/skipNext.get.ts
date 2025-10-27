import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { getRequestHeader, eventHandler, setResponseHeaders, sendNoContent } from 'h3'
import { responseHeaders } from '../../../lib/plexApi'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import type { PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import type { PlayQueueRefresherPayload } from '../../../tasks/playQueueRefresher'

const logger = useLogger('playback.skipNext')

export default eventHandler(async (event) => {
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  if (!targetClientIdentifier || !clientIdentifier || !deviceName) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers)`,
        { status: 400 }
      )
    )
  }

  try {
    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier)

    const status = await player.status()
    // in case we are at the end of the playlist, we need to refresh the play queue first
    if (status && status.playlist_cur_index === status.playlist_tracks - 1) {
      // Plexamp does not always provide the full play queue in the beginning. (e.g track radio playQueue, is later populated on PMS), so we force refresh it here
      // before skipping to next track to avoid skipping to "no track" on LMS and stopping playback
      const payload = { playerIdentifier: targetClientIdentifier } as PlayQueueRefresherPayload
      const playQueueResult = await runTask('playQueueRefresher', { payload })
      const refreshedPlayerQueue = playQueueResult?.result as PlayerPlayQueue | undefined
      if (refreshedPlayerQueue) {
        // now skip to next track which should be available after play queue refresh
        const tracks = refreshedPlayerQueue.playQueue.MediaContainer.Track ?? []
        const endedTrackIndex = tracks.findIndex((t) => status.remoteMeta?.url.includes(t?.Media[0]?.Part[0]?.$.key))
        const nextTrackIndex = Math.min(endedTrackIndex + 1, tracks.length - 1)
        await player.selectTrackInPlaylist(nextTrackIndex)
        logger.info(`Player '${targetClientIdentifier}' (${playerInfo.name}) skipped to next track at playQueue index ${nextTrackIndex} after refreshing play queue`)
      } else {
        logger.warn(`Could not refresh play queue for player '${targetClientIdentifier}' (${playerInfo.name}): playQueue not loaded for player`)
      }
    } else {
      // the normal case, just skip to next track since there are track left loaded on LMS playlist
      await player.skipNext()
      logger.info(`Player '${targetClientIdentifier}' (${playerInfo.name}) skipped to next track`)
    }

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when skipping to next track player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to start playing, try again later`, { status: 404 })
    )
  }
})
