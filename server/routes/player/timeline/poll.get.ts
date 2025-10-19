import { eventHandler, getRequestHeader, getQuery } from 'h3'
import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { getTrackIndexByPlayQueueItemID, type PlayerPlayQueue, timelineResponse } from '../../../lib/plexPlayerTimeline'
import { responseHeaders } from '../../../lib/plexApi'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import useXmlBuilder from '../../../composables/useXmlBuilder'

const logger = useLogger('timeline.poll')

export interface RemoteSubscriber {
  // the client that subscribes to the targetClientIdentifier player
  clientIdentifier: string
  // the device name of the client
  deviceName: string
  // the commandId of the timeline request
  commandId: string
  // whether the client subscribed via /timeline/poll or /timeline/subscribe
  poll: boolean
  // the player the client subscribes to
  targetClientIdentifier: string
  // the date when the client subscribed
  subscribedAt: Date
}

export default eventHandler(async (event) => {
  const storage = useStorage('DISCOVERY')
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  const queryParameters = {
    type: query.type as string,
    commandId: query.commandID as string | undefined,
    wait: query.wait as string | undefined,
    includeMetadata: query.includeMetadata === '1'
  }

  if (!targetClientIdentifier || !clientIdentifier || !deviceName || !queryParameters.commandId) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter), got: ${targetClientIdentifier}, ${clientIdentifier}, ${deviceName}, ${queryParameters.commandId}`
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }

  try {
    logger.debug(`Polling player ${targetClientIdentifier} status ..: ${JSON.stringify(event.node.req.headers)}`)

    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier)
    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Player '${targetClientIdentifier}' status not available yet`)
    }

    // check if the player is at the end of the track and refresh the playQueue
    if (playerStatus.mode === 'play' && playerStatus.time > 0 && playerStatus.time == playerStatus.duration) {
      logger.info(`Player '${playerInfo.name}' reached end of track, triggering playQueue refresher ..`)

      // This seems unnecessary complex but is needed to ensure that after a playQueue refresh the player continues playback with the correct next track.
      // Due to the async nature of the playQueue refresher task and PMS updating in the background, we can't be sure that the set playQueueSelectedItemOffset is already pointing to the next track
      // or if the fetch of the refreshed playQueue just happened right before the $.playQueueSelectedItem* fields were updated and therefore still pointing to the track that just ended on LMS.

      const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
      // Get the next track from the former playerQueue and try to find its index in the refreshed playQueue to continue playback with the correct track. Must happen before running the playQueue refresher task or index will be index 0
      const nextTrackIndex = playerStatus.playlist_cur_index + 1
      const tracks = playerQueue?.playQueue.MediaContainer.Track ?? []
      const nextTrack = nextTrackIndex >= 0 && nextTrackIndex < tracks.length ? tracks[nextTrackIndex] : undefined

      await runTask('playQueueRefresher')
      const refreshedPlayerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
      if (refreshedPlayerQueue) {
        const maybeTrackIndex = getTrackIndexByPlayQueueItemID(refreshedPlayerQueue, nextTrack?.$.playQueueItemID || '')
        if (maybeTrackIndex !== undefined && maybeTrackIndex >= 0) {
          logger.info(
            `Continuing playlist with track at index '${maybeTrackIndex}' in player '${playerInfo.name}' after playQueue refresh on track end ..`
          )
          await player.selectTrackInPlaylist(maybeTrackIndex)
        } else {
          // insecure fallback to continue playback in case there was no valid next track on the former playQueue
          // this can happen if the track was the last track of the playQueue or the next track could not be found in the refreshed playQueue for some reason
          const playQueueSelectedItemOffset = Number(refreshedPlayerQueue.playQueue.MediaContainer.$.playQueueSelectedItemOffset) + 1
          logger.info(
            `Could not resolve next track after playQueue refresh with ${nextTrack?.$.playQueueItemID}, continuing playback with playQueueSelectedItemOffset '${playQueueSelectedItemOffset}' in player '${playerInfo.name}' ..`
          )
          await player.selectTrackInPlaylist(playQueueSelectedItemOffset)
        }
      }
    }

    /**
     * Represents a plex client that subscribed to a squeeze player for polling.
     */
    const subscriber: RemoteSubscriber = {
      // the id of the plex client that subscribed
      clientIdentifier,
      // the name of the squeeze player the subscriber subscribed to
      deviceName,
      commandId: queryParameters.commandId,
      poll: true,
      // the id of the squeeze target player
      targetClientIdentifier,
      subscribedAt: new Date()
    }

    const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
    const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'text/xml')
    if (queryParameters.wait === '1') {
      // don't send timeline response immediately, wait for player to change state and send timeline response in timelinePublisher
      await storage.setItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`, subscriber)
      logger.info(`Client '${clientIdentifier}' subscribed to player '${playerInfo.name}' for polling`)
      // TODO don't really understand the wait === 1 logic, this works as a workaround for now to prevent the client going wild with subscribing
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const status = await player.status()
      if (status) {
        const timelineXml = await timelineResponse(status, subscriber, playerQueue, queryParameters.includeMetadata)
        const { xmlString } = useXmlBuilder(timelineXml, true)
        return event.respondWith(new Response(xmlString, { status: 200, headers }))
      }
      // will result in a 204 no content
      return
    }

    const timelineXml = await timelineResponse(playerStatus, subscriber, playerQueue, queryParameters.includeMetadata)
    const { xmlString } = useXmlBuilder(timelineXml, true)
    logger.debug(
      `Polling player ${playerInfo.name}, wait: ${queryParameters.wait}, includeMeta: ${queryParameters.includeMetadata}, timeline: ${xmlString}, queue ${playerQueue?.playerId}`
    )
    return event.respondWith(new Response(xmlString, { status: 200, headers }))
  } catch (error: any) {
    logger.info(`Could not poll player '${targetClientIdentifier}', try again later. Reason: ${error.message}`)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})
