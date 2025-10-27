import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { responseHeaders } from '../../../lib/plexApi'
import { getTrackIndexByPlayQueueItemID, type PlayerPlayQueue } from '../../../lib/plexPlayerTimeline'
import { eventHandler, getRequestHeader, setResponseHeaders, getQuery, sendNoContent } from 'h3'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import type { PlayQueueRefresherPayload } from '../../../tasks/playQueueRefresher'

const logger = useLogger('playback.skipTo')

export default eventHandler(async (event) => {
  const storage = useStorage('DISCOVERY')
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  const queryParameters = {
    key: query.key as string,
    commandID: query.commandID as string,
    playQueueItemID: query.playQueueItemID as string
  }

  if (!targetClientIdentifier || !clientIdentifier || !deviceName || !queryParameters.playQueueItemID) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) or query parameter playQueueItemID got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) or query parameter playQueueItemID`,
        { status: 400 }
      )
    )
  }

  try {
    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier)

    const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
    if (!playerQueue) {
      logger.debug(`No playerQueue available for player ${playerInfo.playerid}, skipping timeline subscriber update ..`)
      return
    }

    async function resolveTrackIndexOrThrow(queue: PlayerPlayQueue): Promise<number> {
      function isTrackIndexValid(index: number | undefined) {
        return index !== undefined && index >= 0
      }

      const maybeTrackIndex = getTrackIndexByPlayQueueItemID(queue, queryParameters.playQueueItemID)
      if (isTrackIndexValid(maybeTrackIndex)) {
        logger.debug(`Resolved playQueueItemID '${queryParameters.playQueueItemID}' to playQueue index '${maybeTrackIndex}'`)
        return maybeTrackIndex
      }

      logger.info(
        `Could not find track with playQueueItemID '${queryParameters.playQueueItemID}' in loaded playerQueue, trying to refresh the playQueue from server ..`
      )
      // Plexamp does not always provide the full play queue in the beginning. (e.g track radio playQueue, is later populated on PMS), so we force refresh it here
      const payload = { playerIdentifier: targetClientIdentifier } as PlayQueueRefresherPayload
      const playQueueResult = await runTask('playQueueRefresher', { payload })
      const refreshedPlayerQueue = playQueueResult?.result as PlayerPlayQueue | undefined
      if (!refreshedPlayerQueue) {
        throw new Error(
          `Could not refresh play queue for player '${targetClientIdentifier}' (${playerInfo.name}) to resolve playQueueItemID '${queryParameters.playQueueItemID}'`
        )
      }
      const maybeRefreshedTrackIndex = getTrackIndexByPlayQueueItemID(refreshedPlayerQueue, queryParameters.playQueueItemID)
      if (isTrackIndexValid(maybeRefreshedTrackIndex)) {
        return maybeRefreshedTrackIndex
      }
      throw new Error(
        `Could not find track with playQueueItemID '${queryParameters.playQueueItemID}' in refreshedplayerQueue, cannot skipTo`
      )
    }

    const trackIndex = await resolveTrackIndexOrThrow(playerQueue)
    await player.selectTrackInPlaylist(trackIndex) // LMS wants a 0-based index here
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
