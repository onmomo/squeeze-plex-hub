import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { getRequestHeader, eventHandler, setResponseHeaders, sendNoContent } from 'h3'
import { responseHeaders } from '../../../lib/plexApi'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
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

    // Plexamp does not always provide the full play queue in the beginning. (e.g track radio playQueue, is later populated on PMS), so we force refresh it here
    // before skipping to next track to avoid skipping to "no track" on LMS and stopping playback
    await runTask('playQueueRefresher', { payload: { forceRefresh: true } as PlayQueueRefresherPayload })
    await player.skipNext()
    logger.info(`Player '${targetClientIdentifier}' skipped to next track`)
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when skipping to next track player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to start playing, try again later`, { status: 404 })
    )
  }
})
