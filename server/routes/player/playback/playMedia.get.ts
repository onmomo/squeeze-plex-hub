import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import { SqueezeServerStub, SqueezeServer, SqueezePlayer } from 'lms-squeeze-rpc'
import { Builder } from 'xml2js'
import type { ServerInfo } from 'lms-discovery'
import axios from 'axios'

const logger = useLogger('playback.playMedia.get')
const storage = useStorage('DISCOVERY')

interface PlexTrack {
  title: string
  album: string
  artist: string
  file: string
  duration: number
  index: number
  key: string
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
    // call plex first to get track information
    const targetTrack = await axios
      .get(url, {
        headers: {
          'X-Plex-Token': plexToken.toString(),
          Accept: 'application/json'
        }
      })
      .then((response) => {
        const playQueueSelectedItemOffset = response.data.MediaContainer.playQueueSelectedItemOffset
        const track: PlexTrack = {
          title: response.data.MediaContainer.Metadata[playQueueSelectedItemOffset].title,
          album: response.data.MediaContainer.Metadata[playQueueSelectedItemOffset].parentTitle,
          artist: response.data.MediaContainer.Metadata[playQueueSelectedItemOffset].grandparentTitle,
          file: response.data.MediaContainer.Metadata[playQueueSelectedItemOffset].Media[0].Part[0].key,
          duration: response.data.MediaContainer.Metadata[playQueueSelectedItemOffset].duration,
          index: playQueueSelectedItemOffset,
          key: response.data.MediaContainer.Metadata[playQueueSelectedItemOffset].key
        }

        logger.info(`parsed track: ${JSON.stringify(track)}`)
        // TODO parse all tracks in playqueue, load all of them to squeeze playlist and play the track matching playQueueSelectedItemOffset
        return track
      })

    const trackUrl = getPlexApiTrackUrl(plexProtocol, plexAddress, plexPort, targetTrack, plexToken)
    logger.info(`Playing ${trackUrl} on player ${serverInfo.ip} and port ${serverInfo.jsonPort}`)
    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    await player.clearPlaylist()
    await player.addToPlaylist(trackUrl, metadata(targetTrack))
    await player.play()

    const response = {
      Response: {
        $: {
          code: 200,
          status: 'OK'
        }
      }
    }
    const builder = new Builder()
    return event.respondWith(new Response(builder.buildObject(response), { status: 200, headers: { 'Content-Type': 'application/xml' } }))
  } catch (error) {
    logger.warn(`Error when playing media with player '${targetClientIdentifier}'`, error)
    return event.respondWith(new Response(`Player '${targetClientIdentifier}' failed to play media, try again later`, { status: 503 }))
  }
})

// TODO refactor to plex object
function getPlexApiUrl(protocol: string, address: string, port: string, path: string): string {
  return `${protocol}://${address}:${port}${path}`
}

function getPlexApiTrackUrl(protocol: string, address: string, port: string, track: PlexTrack, token: string): string {
  return `${protocol}://${address}:${port}${track.file}?X-Plex-Token=${token}`
}

/**
 * Returns metadata string that LMS seems to be able to parse.
 * @param track track to generate LMS metadata
 * @returns LMS for LMS
 */
function metadata(track: PlexTrack): string {
  return `${track.artist} - ${track.title} (${track.album})`
}
