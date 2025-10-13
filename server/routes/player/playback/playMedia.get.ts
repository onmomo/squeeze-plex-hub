import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { getPlayQueue, metadata, responseHeaders, getPlexApiTrack } from '../../../lib/plexApi'
import type { PlayerPlayQueue, PlayQueue } from '../../../lib/plexPlayerTimeline'
import { getRequestHeader, getQuery, eventHandler, setResponseHeaders, sendNoContent } from 'h3'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'

const logger = useLogger('playback.playMedia')

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

  if (
    !targetClientIdentifier ||
    !queryParameters.commandID ||
    !queryParameters.address ||
    !queryParameters.protocol ||
    !queryParameters.port ||
    !queryParameters.token ||
    !queryParameters.containerKey ||
    !queryParameters.key
  ) {
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
    const plexServer = {
      server: {
        protocol: queryParameters.protocol,
        localAddress: queryParameters.address,
        port: Number(queryParameters.port),
        resourceIdentifier: queryParameters.machineIdentifier
      },
      token: queryParameters.token
    }

    const storage = useStorage('DISCOVERY')
    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier)

    const playQueue: PlayQueue = await getPlayQueue(plexServer, queryParameters.containerKey)
    const playerQueue: PlayerPlayQueue = {
      playerId: playerInfo.playerid,
      playQueue,
      plexServer
    }

    await player.clearPlaylist()
    for (const track of playQueue.MediaContainer.Track) {
      logger.info(`Adding track '${track.$.title}' to player '${playerInfo.name}' playlist ..`)
      const trackUrl = getPlexApiTrack(plexServer, track)
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    logger.info(`Playing playlist item '${playQueue.MediaContainer.$.playQueueSelectedItemOffset}' on player '${playerInfo.name}'`)
    await player.selectTrackInPlaylist(Number(playQueue.MediaContainer.$.playQueueSelectedItemOffset))
    await storage.setItem(`playerQueue/${playerInfo.playerid}`, playerQueue)

    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when playing media with player '${targetClientIdentifier}'`, error)
    return event.respondWith(new Response(`Player '${targetClientIdentifier}' failed to play media, try again later`, { status: 503 }))
  }
})
