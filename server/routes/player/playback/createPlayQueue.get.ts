import useLogger from '~/server/composables/useLogger'
import { getRequestHeader, getQuery } from 'h3'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { getPlexApi, getPlexApiTrack, metadata, responseHeaders } from '~/server/lib/plexApi'
import axios, { AxiosError } from 'axios'
import xml2js from 'xml2js'
import type { PlayerPlayQueue, PlayQueue } from '~/server/lib/plexPlayerTimeline'

// GET /player/playback/createPlayQueue?source=db8490d1d364f23ae031ccf6f1e4cdd3bxxxxxx&shuffle=0&uri=server%3A%2F%2Fdb8490d1d364f23ae031ccf6f1e4cdd3baeb228e%2Fcom.plexapp.plugins.library%2Flibrary%2Fmetadata%2F43961%2Fchildren&playlistID=undefined&token=transient-xxxx&includeExternalMedia=1&type=audio&protocol=https&address=10-0-1-5.d099fb26cfd04a089bfcd4b708xxxxx.plex.direct&port=32400&machineIdentifier=db8490d1d364f23ae031ccf6f1e4cdd3bxxxxxx&commandID=25317 HTTP/1.1
// Host: 10.0.1.105:32500
// User-Agent: TREBLE/2.1
// Accept: */*
// X-Plex-Device-Name: MacBook Pro
// X-Plex-Target-Client-Identifier: b9409b96-6d7f-4a40-8e12-80dfebee3xxx
// X-Plex-Client-Identifier: 6a0ceed7-5dda-4fd8-94d2-dc9be45e2xxx
// Accept-Encoding: gzip

// HTTP/1.1 200 OK
// Access-Control-Allow-Headers: *
// Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE, PUT, HEAD
// Access-Control-Allow-Origin: *
// Access-Control-Allow-Private-Network: true
// Access-Control-Max-Age: 1209600
// Vary: Accept-Encoding
// uWebSockets: 19
// Content-Length: 0

// catchAll route triggered: GET /player/playback/createPlayQueue?source=db8490d1d364f23ae031ccf6f1e4cdd3baeb228e&shuffle=0&uri=server%3A%2F%2Fdb8490d1d364f23ae031ccf6f1e4cdd3baeb228e%2Fcom.plexapp.plugins.library%2Flibrary%2Fmetadata%2F43809%2Fchildren&playlistID=undefined&token=transient-b652d039-e27d-4832-99c1-1ed133dc7512&includeExternalMedia=1&type=audio&protocol=https&address=10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct&port=32400&machineIdentifier=db8490d1d364f23ae031ccf6f1e4cdd3baeb228e&commandID=14
const logger = useLogger('playback.createPlayQueue')
const storage = useStorage('DISCOVERY')

/**
 * This will create a play queue on plex server and play it on the target player.
 */
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

  // TODO check for server stuff in query parameters as well
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

  try {
    logger.debug(`Creating play queue for player ${targetClientIdentifier} ..: ${JSON.stringify(event.node.req.headers)} and Query: ${JSON.stringify(queryParameters)}`)    

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
      server: {
        protocol: queryParameters.protocol,
        localAddress: queryParameters.address,
        port: Number(queryParameters.port),
        resourceIdentifier: queryParameters.machineIdentifier
      },
      token: queryParameters.token
    }

    const playQueueUrl = getPlexApi(plexServer, '/playQueues')
    const createPlayQueueUrl = `${playQueueUrl}?type=${queryParameters.type}&shuffle=${queryParameters.shuffle}&includeExternalMedia=${queryParameters.includeExternalMedia}&repeat=0&uri=${queryParameters.uri}`
    logger.info(`Creating play queue on Plex server with URL: ${createPlayQueueUrl}`)
    const createPlayQueueResponse = await axios
      .post<string>(createPlayQueueUrl, '', {
        headers: {
          'X-Plex-Token': queryParameters.token,
          'X-Plex-Client-Identifier': clientIdentifier, // TODO clientIdentifier or targetClientIdentifier? Who owns the play queue ultimatively?
          Accept: 'application/xml'
        }
      })
      .then((response) => {
        if (!response.data) {
          throw new Error('No playQueue responded from Plex server')
        }
        return response.data
      })
      .catch((error: AxiosError) => {
        throw new Error(`Failed to create play queue on Plex server: ${error.message}`)
      })

    const parser = new xml2js.Parser()
    const playQueue: PlayQueue = await parser.parseStringPromise(createPlayQueueResponse).catch((error) => {
      throw new Error(`Failed to parse play queue response from Plex server: ${error.message}`)
    })

    //logger.info(`Retrieved playQueue information from Plex for player '${JSON.stringify(createPlayQueueResponse.data)}'`)
    //const playQueueSelectedItemOffset = createPlayQueueResponse.data.MediaContainer.playQueueSelectedItemOffset || 0
    //logger.info(`Retrieved playQueue information from Plex for player '${JSON.stringify(createPlayQueueResponse.data)}'`)
    //const playQueue: PlexPlayQueue = parsePlayQueueResult(createPlayQueueResponse.data)
    if (!playQueue) {
      throw new Error(`No playQueue received from Plex server response for uri ${queryParameters.uri}`)
    }

    const playerQueue: PlayerPlayQueue = {
        playerId: playerInfo.playerid,
        playQueue,
        plexServer
    }
        
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playerQueue)
    //await storage.setItem(`playQueue/${playQueue.MediaContainer.$.playQueueID}`, playQueue)
    logger.info(`Created play queue on Plex server with ID: ${playQueue.MediaContainer.$.playQueueID}`)

    await player.clearPlaylist()
    for (const meta of playQueue.MediaContainer.Track) {
      logger.info(`Adding track '${meta.$.title}' to player '${playerInfo.name}' playlist ..`)
      const trackUrl = getPlexApiTrack(plexServer, meta)
      await player.addToPlaylist(trackUrl, metadata(meta))
    }
    await player.selectTrackInPlaylist(playQueue.MediaContainer.$.playQueueSelectedItemOffset)
    await player.play()
    logger.info(
      `Playing playlist index '${playQueue.MediaContainer.$.playQueueSelectedItemOffset}' on player ${playerInfo.name} / ${playerInfo.playerid}`
    )
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
