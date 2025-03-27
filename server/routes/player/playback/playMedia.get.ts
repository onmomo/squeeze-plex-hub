import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'
import { getPlayQueue, metadata, responseHeaders, getPlexApiTrack } from '../../../lib/plexApi'
import type { PlayerPlayQueue, PlayQueue } from '~/server/lib/plexPlayerTimeline'

const logger = useLogger('playback.playMedia')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const query = getQuery(event)
  const queryParameters = {    
    key: query.key as string,
    containerKey: query.containerKey as string | undefined,
    token: query.token as string,    
    type: query.type as string,
    protocol: query.protocol as string,
    address: query.address as string,
    port: query.port as string,
    machineIdentifier: query.machineIdentifier as string,
    commandID: query.commandID as string
  }



  if (!targetClientIdentifier || !queryParameters.commandID || !queryParameters.address || !queryParameters.protocol || !queryParameters.port || !queryParameters.token || !queryParameters.containerKey || !queryParameters.key) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier' header and 'commandID' query parameter) in playMedia request`,
        { status: 400 }
      )
    )
  }

  logger.debug(`PlayMedia Queries: ${JSON.stringify(query)}`)

  try {
    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      throw new Error('No LMS found in storage, skipping')
    }

    const allPlayers: [string, IPlayerInfo][] = [] // Array of tuples (serverId, IPlayerInfo)

    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      const serverId = key.split(':')[1] // e.g. players:de443cee-943b-421a-8db3-575e5b4cddc6 where the later is the serverId
      if (playerInfos) {
        for (const player of playerInfos) {
          allPlayers.push([serverId, player])
        }
      }
    }

    const playerServerTuple = allPlayers.find(([_, p]) => p.playerid === targetClientIdentifier)
    if (!playerServerTuple) {
      throw new Error(`Player not found in storage for playMedia`)
    }

    const [serverId, playerInfo] = playerServerTuple // Extract key and playerInfo

    const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
    if (!serverInfo || !serverInfo.ip) {
      throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
    }

    const plexServer = {
      server: {
        protocol: queryParameters.protocol,
        localAddress: queryParameters.address,
        port: Number(queryParameters.port),
        resourceIdentifier: queryParameters.machineIdentifier
      },
      token: queryParameters.token
    }
    
    const playQueue: PlayQueue = await getPlayQueue(plexServer, queryParameters.containerKey)
    const playerQueue: PlayerPlayQueue = {
      playerId: playerInfo.playerid,
      playQueue,
      plexServer
  }
    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    const player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    await player.clearPlaylist()
    for (const track of playQueue.MediaContainer.Track) {
      logger.info(`Adding track '${track.$.title}' to player '${playerInfo.name}' playlist ..`)
      const trackUrl = getPlexApiTrack(plexServer, track)
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    logger.info(`Playing playlist item '${playQueue.MediaContainer.$.playQueueSelectedItemOffset}' on player '${playerInfo.name}'`)
    await player.selectTrackInPlaylist(playQueue.MediaContainer.$.playQueueSelectedItemOffset)    
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playerQueue)

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when playing media with player '${targetClientIdentifier}'`, error)
    return event.respondWith(new Response(`Player '${targetClientIdentifier}' failed to play media, try again later`, { status: 503 }))
  }
})
