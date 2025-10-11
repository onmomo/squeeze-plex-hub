import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { getRequestHeader, getQuery, eventHandler, setResponseHeaders, sendNoContent  } from 'h3'
import { getPlexApi, getPlexApiTrack, metadata, responseHeaders } from '../../../lib/plexApi'
import type { AxiosError } from 'axios';
import axios from 'axios'
import xml2js from 'xml2js'
import type { PlayerPlayQueue, PlayQueue } from '../../../lib/plexPlayerTimeline'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'

const logger = useLogger('playback.createPlayQueue')

/**
 * This will create a play queue on plex server and play it on the target player.
 */
export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  const queryParameters = {
    source: query.source as string,
    shuffle: query.shuffle as string | undefined, // seems not always provided
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
    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier) 

    const plexServer = {
      server: {
        protocol: queryParameters.protocol,
        localAddress: queryParameters.address,
        port: Number(queryParameters.port),
        resourceIdentifier: queryParameters.machineIdentifier
      },
      token: queryParameters.token // we need this later so LMS can stream the tracks from plex server
    }

    const playQueueUrl = getPlexApi(plexServer, '/playQueues')
    const params = new URLSearchParams({
      includeLoudnessRamps: '1',
      includeFields: 'thumbBlurHash',
      type: queryParameters.type,
      shuffle: (queryParameters.shuffle ?? '0').toString(),
      includeExternalMedia: queryParameters.includeExternalMedia,
      repeat: '0',
      uri: queryParameters.uri
    })
    const createPlayQueueUrl = `${playQueueUrl}?${params.toString()}`
    logger.info(`Creating play queue on Plex server with URL: ${createPlayQueueUrl}..`)
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
          throw new Error('Invalid playQueue response from Plex server received')
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

    logger.debug(`Retrieved playQueue information from Plex for player '${JSON.stringify(playQueue)}'`)
    if (!playQueue || playQueue.MediaContainer?.Track === undefined) {
      // should not happen, but sometimes plex server returns a playQueue with 0 tracks playing mixes or artist radios if there is no (sonically) similar artist available
      throw new Error(`Incomplete playQueue response received, skip: ${JSON.stringify(playQueue)}`)
    }

    const playerQueue: PlayerPlayQueue = {
        playerId: playerInfo.playerid,
        playQueue,
        plexServer
    }
        
    const storage = useStorage('DISCOVERY')
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playerQueue)
    logger.info(`Created playQueue '${playQueue.MediaContainer.$.playQueueID}' for player '${playerInfo.name}', successfully`)

    await player.clearPlaylist()    
    logger.info(
      `Adding ${playQueue.MediaContainer.Track?.length} tracks to player '${playerInfo.name}' (id=${playerInfo.playerid}) from Plex playQueue '${playQueue.MediaContainer.$.playQueueID}'`
    )
    for (const meta of playQueue.MediaContainer.Track) {
      logger.info(`Adding track '${meta.$.title}' to player '${playerInfo.name}' queue ..`)
      const trackUrl = getPlexApiTrack(plexServer, meta)
      await player.addToPlaylist(trackUrl, metadata(meta))
    }
    await player.selectTrackInPlaylist(playQueue.MediaContainer.$.playQueueSelectedItemOffset)
    await player.play()
    logger.info(
      `Playing playlist index '${playQueue.MediaContainer.$.playQueueSelectedItemOffset}' on player '${playerInfo.name} / ${playerInfo.playerid}'`
    )
    
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when creating play queue for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for creating play queue, try again later`, { status: 404 })
    )
  }
})
