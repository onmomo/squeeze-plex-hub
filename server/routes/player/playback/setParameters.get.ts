import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { getRequestHeader, getQuery, eventHandler, setResponseHeaders, sendNoContent } from 'h3'
import { responseHeaders } from '../../../lib/plexApi'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'

const logger = useLogger('playback.setParameters')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  const queryParameters = {
    type: query.type as string,
    commandID: query.commandID as string,
    volume: query.volume as string | undefined,
    shuffle: query.shuffle as string | undefined, // TODO implement
    repeat: query.repeat as string | undefined
  }

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

    if (queryParameters.volume) {
      await player.setVolumeAsync(parseInt(queryParameters.volume))
      logger.info(`Player '${targetClientIdentifier}' set volume to '${queryParameters.volume}'.`)
    }

    if (queryParameters.repeat) {
      // Plex sends repeat as: 0=off, 1=current track, 2=entire playlist
      await player.playlistRepeatMode(parseInt(queryParameters.repeat))
      logger.info(`Player '${targetClientIdentifier}' set repeat mode to '${queryParameters.repeat}'.`)
    }

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when skipping to next track player '${targetClientIdentifier}' ${error}`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to set parameters, try again later`, { status: 404 })
    )
  }
})
