import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import ExtendedSqueezePlayer from '../../../lib/squeezePlayer'
import { responseHeaders } from '../../../lib/plexApi'
import type { PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import { eventHandler, getRequestHeader, setResponseHeaders, getQuery, sendNoContent } from 'h3'

const logger = useLogger('playback.skipTo')

export default eventHandler(async (event) => {
  const storage = useStorage('DISCOVERY')
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  logger.info(`SkipTo request received for player '${targetClientIdentifier}' with query: ${JSON.stringify(query)}`)
  const queryParameters = {
    key: query.key as string,
    commandID: query.commandID as string,
    playQueueItemID: query.playQueueItemID as string
  }

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

    const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
    if (!playerQueue) {
      logger.debug(`No playerQueue available for player ${playerInfo.playerid}, skipping timeline subscriber update ..`)
      return
    }

    function getTrackIndexByPlayQueueItemID(queue: PlayerPlayQueue, playQueueItemID: string): number {
      const tracks = queue.playQueue?.MediaContainer?.Track ?? []
      return tracks.findIndex((t) => t.$.playQueueItemID === playQueueItemID)
    }

    const trackIndex = getTrackIndexByPlayQueueItemID(playerQueue, queryParameters.playQueueItemID)
    logger.debug(`Resolved playQueueItemID ${queryParameters.playQueueItemID} to playQueue index ${trackIndex}`)
    if (trackIndex < 0) {
      throw new Error(`Could not find track with playQueueItemID ${queryParameters.playQueueItemID} in playerQueue, cannot skipTo`)
    }

    await player.selectTrackInPlaylist(trackIndex.toString()) // LMS wants a 0-based index here
    logger.info(`Player '${targetClientIdentifier}' skipped to playlist item ${trackIndex}`)
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when skipTo to playlist track ${queryParameters.playQueueItemID} with player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available to skipTo track, try again later`, { status: 404 })
    )
  }
})
