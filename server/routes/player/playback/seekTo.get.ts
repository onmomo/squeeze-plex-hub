import useLogger from '~/server/composables/useLogger'
import usePlayerInfo from '~/server/composables/usePlayerInfo'
import { getRequestHeader, getQuery } from 'h3'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { responseHeaders } from '~/server/lib/plexApi'

const logger = useLogger('playback.seekTo')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')  
  
  const queryParameters = {
    type: query.type as string,
    commandID: query.commandID as string,
    offset: query.offset as string | undefined
  }

  if (!targetClientIdentifier || !clientIdentifier || !queryParameters.offset) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier' headers), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier' headers or offset parameter)`,
        { status: 400 }
      )
    )
  }

  try {
    const { playerInfo, serverStub } = await usePlayerInfo(targetClientIdentifier)
    const player = new ExtendedSqueezePlayer(serverStub, playerInfo)

    if (queryParameters.offset) {      
      const offsetInSeconds = parseInt(queryParameters.offset, 10) / 1000
      logger.info(`Seeking track to ${offsetInSeconds}s on player '${playerInfo.name}' (ID: '${targetClientIdentifier}') ..`)
      await player.seekTo(offsetInSeconds)
    }
    
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when seeking track on player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to seek track, try again later`, { status: 404 })
    )
  }
})
