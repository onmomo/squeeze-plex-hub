import useLogger from '~/server/composables/useLogger'
import { getRequestHeader, getQuery } from 'h3'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { PlexPlayQueue, PlexTrack } from '../playback/playMedia.get'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { extractMetadataKeyFromServerPath, getPlexApi, getPlexApiTrack, metadata, responseHeaders } from '~/server/lib/plexApi'
import axios from 'axios'

// catchAll route triggered: GET /player/playback/createPlayQueue?source=db8490d1d364f23ae031ccf6f1e4cdd3baeb228e&shuffle=0&uri=server%3A%2F%2Fdb8490d1d364f23ae031ccf6f1e4cdd3baeb228e%2Fcom.plexapp.plugins.library%2Flibrary%2Fmetadata%2F43809%2Fchildren&playlistID=undefined&token=transient-b652d039-e27d-4832-99c1-1ed133dc7512&includeExternalMedia=1&type=audio&protocol=https&address=10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct&port=32400&machineIdentifier=db8490d1d364f23ae031ccf6f1e4cdd3baeb228e&commandID=14
const logger = useLogger('playback.createPlayQueue')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  //const plexToken = getRequestHeader(event, 'X-Plex-Token')  

  const queryParameters = {
    source: query.source as string,
    shuffle: query.shuffle as string,
    uri: query.uri as string,
    key: query.key as string,
    token: query.token as string,
    includeExternalMedia: query.includeExternalMedia as string,
    type: query.type as string,
    protocol: query.protocol as string,
    address: query.address as string,
    port: query.port as string,
    machineIdentifier: query.machineIdentifier as string,
    commandID: query.commandID as string
  }

  if (!targetClientIdentifier || !clientIdentifier || !deviceName) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) in request`,
        { status: 400 }
      )
    )
  }

  logger.debug(`Creating play queue for player ${targetClientIdentifier} ..: ${JSON.stringify(event.node.req.headers)}`)
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
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Player ${targetClientIdentifier} status available yet`)
    }

    const plexServer = {
      host: queryParameters.address,
      port: queryParameters.port,
      protocol: queryParameters.protocol,
      token: queryParameters.token
    }
    // TODO uri is there if full album is played, whereas key is there if a specific track is played from the album, WHY?!
    const key = queryParameters.uri ? extractMetadataKeyFromServerPath(queryParameters.uri) : queryParameters.key
    const url = getPlexApi(plexServer, key)
    // retrieve playQueue information from plex
    const response = await axios.get(url, {
      headers: {
        'X-Plex-Token': queryParameters.token,
        Accept: 'application/json'
      }
    })

    const playQueueSelectedItemOffset = response.data.MediaContainer.playQueueSelectedItemOffset || 0
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
        host: queryParameters.address,
        port: queryParameters.port,
        protocol: queryParameters.protocol,
        token: queryParameters.token
      }
    }

    await player.clearPlaylist()
    for (const track of playQueue.tracks) {
      logger.info(`Adding track '${track.title}' to player '${playerInfo.name}' playlist ..`)
      const trackUrl = getPlexApiTrack(plexServer, track, queryParameters.token)
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    logger.info(
      `Playing playlist index '${playQueue.playQueueSelectedItemOffset}' on player ${serverInfo.ip} and port ${serverInfo.jsonPort}`
    )
    await player.selectTrackInPlaylist(playQueue.playQueueSelectedItemOffset)
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playQueue)
    // const playMediaResponse = {
    //   Response: {
    //     $: {
    //       code: 200,
    //       status: 'OK'
    //     }
    //   }
    // }
    // const builder = new Builder({ headless: true })
    // return event.respondWith(
    //   new Response(builder.buildObject(playMediaResponse), { status: 200, headers: { 'Content-Type': 'text/xml' } })
    // )

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when creating play queue for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for creating play queue, try again later`, { status: 404 })
    )
  }
})
