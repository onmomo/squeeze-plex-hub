import useLogger from '~/server/composables/useLogger'
import usePlayerInfo from '~/server/composables/usePlayerInfo'
import { getRequestHeader } from 'h3'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { responseHeaders } from '~/server/lib/plexApi'

const logger = useLogger('playback.pause')

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
    const { playerInfo, serverStub } = await usePlayerInfo(targetClientIdentifier)
    const player = new ExtendedSqueezePlayer(serverStub, playerInfo)

    await player.pause()
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when start to pause player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to pause playing, try again later`, { status: 404 })
    )
  }
})
