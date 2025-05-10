import useLogger from '~/server/composables/useLogger'
import usePlayerInfo from '~/server/composables/usePlayerInfo'
import { getRequestHeader, getQuery } from 'h3'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { responseHeaders } from '~/server/lib/plexApi'

const logger = useLogger('playback.setParameters')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  logger.info(`queries: ${JSON.stringify(query)}`)
  const queryParameters = {
    type: query.type as string,
    commandID: query.commandID as string,
    shuffle: query.shuffle as string | undefined, // TODO implement
    volume: query.volume as string | undefined,
    repeat: query.repeat as string | undefined, // TODO implement
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
    const { playerInfo, serverStub } = await usePlayerInfo(targetClientIdentifier)
    const player = new ExtendedSqueezePlayer(serverStub, playerInfo)

    if (queryParameters.volume) {
      await player.setVolumeAsync(parseInt(queryParameters.volume))
      logger.info(`Player '${targetClientIdentifier}' set volume to ${queryParameters.volume}.`)
    }
    
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when skipping to next track player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to set parameters, try again later`, { status: 404 })
    )
  }
})
