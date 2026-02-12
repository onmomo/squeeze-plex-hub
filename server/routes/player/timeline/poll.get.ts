import { eventHandler, getRequestHeader, getQuery } from 'h3'
import useLogger from '../../../composables/useLogger'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import { type PlayerPlayQueue, timelineResponse } from '../../../lib/plexPlayerTimeline'
import { responseHeaders } from '../../../lib/plexApi'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import useXmlBuilder from '../../../composables/useXmlBuilder'
import type { PlayQueueRefresherPayload } from '../../../../server/tasks/playQueueRefresher'

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
    let playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Player '${targetClientIdentifier}' status not available yet`)
    }

    // check if player playQueue is currently being updated on LMS via playQueueRefresher task
    let playerQueueUpdating = (await storage.getItem<boolean>(`playerQueueUpdating/${targetClientIdentifier}`)) ?? false
    if (
      !playerQueueUpdating &&
      playerStatus.mode === 'stop' &&
      playerStatus.time > 0 &&
      playerStatus.playlist_cur_index === playerStatus.playlist_tracks - 1 // check if the player is at the end of the track and refresh the playQueue
    ) {
      logger.info(`Last track of playlist playing on player '${playerInfo.name}' reached end of track, triggering playQueue refresher ..`)
      const payload = { playerIdentifier: targetClientIdentifier } as PlayQueueRefresherPayload
      const playQueueResult = await runTask('playQueueRefresher', { payload })
      const refreshedPlayerQueue = playQueueResult?.result as PlayerPlayQueue
      if (!refreshedPlayerQueue) {
        throw new Error(`Could not refresh play queue for player '${targetClientIdentifier}' (${playerInfo.name}) after last track ended`)
      }

      const tracks = refreshedPlayerQueue.playQueue.MediaContainer.Track ?? []
      logger.debug(
        `Refreshed playQueue for player '${playerInfo.name}' has ${tracks.length} tracks. Selecting next track ..`
      )
      // found that the PMS provided playQueueSelectedItemOffset and playQueueSelectedItemId can be out of sync with the already updated tracks in the playQueue on PMS
      // therefore we try to find the currently ended track by URL matching and select the next one
      const endedTrackIndex = tracks.findIndex((t) => playerStatus?.remoteMeta?.url.includes(t?.Media[0]?.Part[0]?.$.key))
      let nextTrackIndex = endedTrackIndex + 1
      if (nextTrackIndex >= tracks.length) {
        // it can happen, that the refreshed playQueue already moved to the next track before we refreshed, so we need to handle that here
        logger.warn(
          `Refreshed playQueueSelectedItemOffset ${nextTrackIndex} exceeds track count ${tracks.length}, setting to last track index`
        )
        nextTrackIndex = tracks.length - 1
      }
      logger.info(`Selecting next track at index ${nextTrackIndex} on player '${playerInfo.name}' after playQueue refresh on track end ..`)
      await player.selectTrackInPlaylist(nextTrackIndex)
      const updated = await player.status()
      // Update the playerStatus, since the select track index change after the refresh
      playerStatus = updated ?? playerStatus
      playerQueueUpdating = false
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
      logger.debug(`Client '${clientIdentifier}' subscribed to player '${playerInfo.name}' for polling (wait = 1)`)
      // TODO don't really understand the wait === 1 logic, this works as a workaround for now to prevent the client going wild with subscribing
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const status = await player.status()
      if (status) {
        const timelineXml = await timelineResponse(status, subscriber, playerQueue, queryParameters.includeMetadata, playerQueueUpdating)
        const { xmlString } = useXmlBuilder(timelineXml, true)
        return event.respondWith(new Response(xmlString, { status: 200, headers }))
      }
      // will result in a 204 no content
      return
    }

    const timelineXml = await timelineResponse(playerStatus, subscriber, playerQueue, queryParameters.includeMetadata, playerQueueUpdating)
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
