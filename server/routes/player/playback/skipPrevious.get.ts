import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { responseHeaders } from '../../../lib/plexApi'
import { eventHandler, getRequestHeader, setResponseHeaders, sendNoContent } from 'h3'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import type { PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import type { PlayQueueRefresherPayload } from '../../../tasks/playQueueRefresher'

const logger = useLogger('playback.skipPrevious')

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
    if (status?.playlist_cur_index === 0) {
      logger.info(
        `Player '${targetClientIdentifier}' (${playerInfo.name}) is already at the start of the playlist, force refreshing play queue and trying to skip to previous track ..`
      )
      const payload = { playerIdentifier: targetClientIdentifier } as PlayQueueRefresherPayload
      const playQueueResult = await runTask('playQueueRefresher', { payload })
      const refreshedPlayerQueue = playQueueResult?.result as PlayerPlayQueue | undefined
      if (refreshedPlayerQueue) {
        // now skip to previous track which should be available after play queue refresh
        const tracks = refreshedPlayerQueue.playQueue.MediaContainer.Track ?? []
        const endedTrackIndex = tracks.findIndex((t) => status.remoteMeta?.url.includes(t?.Media[0]?.Part[0]?.$.key))
        const previousTrackIndex = Math.max(endedTrackIndex - 1, 0)
        await player.selectTrackInPlaylist(previousTrackIndex)
        logger.info(
          `Player '${targetClientIdentifier}' (${playerInfo.name}) skipped to previous track at playQueue index ${previousTrackIndex} after refreshing play queue`
        )
      } else {
        logger.warn(
          `Could not refresh play queue for player '${targetClientIdentifier}' (${playerInfo.name}): playQueue not loaded for player`
        )
      }
    } else {
      await player.skipPrevious()
      logger.info(`Player '${targetClientIdentifier}' (${playerInfo.name}) skipped to previous track`)
    }
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when skipping to previous track with player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to start playing, try again later`, { status: 404 })
    )
  }
})
