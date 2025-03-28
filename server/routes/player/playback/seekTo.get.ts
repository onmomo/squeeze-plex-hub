import useLogger from '~/server/composables/useLogger'
import { getRequestHeader, getQuery } from 'h3'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { responseHeaders } from '~/server/lib/plexApi'

const logger = useLogger('playback.seekTo')
const storage = useStorage('DISCOVERY')

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
    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      throw new Error('No LMS found in storage, skipping')
    }

    const allPlayers: [string, IPlayerInfo][] = []

    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      const serverId = key.split(':')[1]
      if (playerInfos) {
        for (const player of playerInfos) {
          allPlayers.push([serverId, player])
        }
      }
    }

    const playerServerTuple = allPlayers.find(([_, p]) => p.playerid === targetClientIdentifier)
    if (!playerServerTuple) {
      throw new Error(`Player not found in storage for createPlayQueue`)
    }

    const [serverId, playerInfo] = playerServerTuple

    const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
    if (!serverInfo || !serverInfo.ip) {
      throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
    }

    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
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
