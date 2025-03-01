import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'
import axios from 'axios'
import { getPlexApiTrackUrl, getPlexApiUrl, metadata, responseHeaders, type PlexServer } from '../../../lib/plexApi'

const logger = useLogger('playback.playMedia.get')
const storage = useStorage('DISCOVERY')

export interface PlexTrack {
  title: string
  album: string
  artist: string
  file: string
  streamId: string
  guid: string
  playQueueItemID: string
  duration: number
  index: number
  key: string
  ratingKey: string
}

export interface PlexPlayQueue {
  tracks: PlexTrack[]
  playQueueSelectedItemOffset: number
  id: string
  containerKey: string
  playQueueVersion: string
  playQueueShuffled: boolean
  count: number
  server: PlexServer
}

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

    const url = getPlexApiUrl(plexProtocol, plexAddress, plexPort, containerKey)
    // retrieve playQueue information from plex
    const response = await axios.get(url, {
      headers: {
        'X-Plex-Token': plexToken.toString(),
        Accept: 'application/json'
      }
    })

    const playQueueSelectedItemOffset = response.data.MediaContainer.playQueueSelectedItemOffset
    const playQueue: PlexPlayQueue = {
      tracks: response.data.MediaContainer.Metadata.map(
        (item: any, index: number) =>
          ({
            title: item.title,
            album: item.parentTitle,
            artist: item.grandparentTitle,
            file: item.Media[0].Part[0].key,
            streamId: item.Media[0].Part[0].id,
            guid: item.guid,
            playQueueItemID: item.playQueueItemID,
            duration: item.duration,
            index: index,
            key: item.key,
            ratingKey: item.ratingKey
          }) as PlexTrack
      ),
      playQueueSelectedItemOffset: playQueueSelectedItemOffset,
      id: response.data.MediaContainer.playQueueID,
      containerKey: `/playQueues/${response.data.MediaContainer.playQueueID}`,
      playQueueVersion: response.data.MediaContainer.playQueueVersion,
      playQueueShuffled: response.data.MediaContainer.playQueueShuffled || false,
      count: response.data.MediaContainer.playQueueTotalCount,
      server: {
        host: plexAddress,
        port: plexPort,
        protocol: plexProtocol,
        token: plexToken
      }
    }

    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)

    await player.clearPlaylist()
    for (const track of playQueue.tracks) {
      logger.info(`Adding track '${track.title}' to player '${playerInfo.name}' playlist ..`)
      const trackUrl = getPlexApiTrackUrl(plexProtocol, plexAddress, plexPort, track, plexToken)
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    logger.info(`Playing playlist item '${playQueue.playQueueSelectedItemOffset}' on player '${playerInfo.name}'`)
    await player.selectTrackInPlaylist(playQueue.playQueueSelectedItemOffset)
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playQueue)

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when playing media with player '${targetClientIdentifier}'`, error)
    return event.respondWith(new Response(`Player '${targetClientIdentifier}' failed to play media, try again later`, { status: 503 }))
  }
})

// TODO {"url":"/player/playback/skipNext?commandID=2&type=music","statusCode":404,"statusMessage":"Page not found: /player/playback/skipNext?commandID=2&type=music","message":"Page not found: /player/playback/skipNext?commandID=2&type=music","stack":"","data":{"path":"/player/playback/skipNext?commandID=2&type=music"}}
