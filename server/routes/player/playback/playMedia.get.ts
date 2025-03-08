import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'
import { getPlayQueue, metadata, responseHeaders, type PlexServer, getPlexApiTrack } from '../../../lib/plexApi'
import type { PlayQueue } from '~/server/lib/plexPlayerTimeline'

const logger = useLogger('playback.playMedia.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const commandId = query.commandID as string | undefined
  const plexAddress = query.address as string | undefined
  const plexProtocol = query.protocol as string | undefined
  const plexPort = query.port as string | undefined
  const plexToken = query.token as string | undefined
  const containerKey = query.containerKey as string | undefined
  const key = query.key as string | undefined
  if (!targetClientIdentifier || !commandId || !plexAddress || !plexProtocol || !plexPort || !plexToken || !containerKey || !key) {
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

logger.info(`queries: ${JSON.stringify(query)}`)

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

    const plexServer: PlexServer = {
      host: plexAddress,
      port: plexPort,
      protocol: plexProtocol,
      token: plexToken
    }
    
    const playQueue: PlayQueue = await getPlayQueue(plexServer, containerKey)

    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    await player.clearPlaylist()
    for (const track of playQueue.MediaContainer.Track) {
      logger.info(`Adding track '${track.$.title}' to player '${playerInfo.name}' playlist ..`)
      const trackUrl = getPlexApiTrack(plexServer, track)
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    logger.info(`Playing playlist item '${playQueue.MediaContainer.$.playQueueSelectedItemOffset}' on player '${playerInfo.name}'`)
    await player.selectTrackInPlaylist(playQueue.MediaContainer.$.playQueueSelectedItemOffset)
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playQueue)

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when playing media with player '${targetClientIdentifier}'`, error)
    return event.respondWith(new Response(`Player '${targetClientIdentifier}' failed to play media, try again later`, { status: 503 }))
  }
})

// TODO {"url":"/player/playback/skipNext?commandID=2&type=music","statusCode":404,"statusMessage":"Page not found: /player/playback/skipNext?commandID=2&type=music","message":"Page not found: /player/playback/skipNext?commandID=2&type=music","stack":"","data":{"path":"/player/playback/skipNext?commandID=2&type=music"}}
