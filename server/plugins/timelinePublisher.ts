import useLogger from '../composables/useLogger'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import type { ServerInfo } from 'lms-discovery'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'
import axios from 'axios'
import { type PlayerPlayQueue, timelineResponse } from '../lib/plexPlayerTimeline'
import { Builder } from 'xml2js'
import { responseHeaders } from '../lib/plexApi'


const logger = useLogger('timelinePublisher')

export default defineNitroPlugin(() => {
  setInterval(runPublishTimeline, 1000)
})

/**
 * Publishes the timeline to the players to all plex clients that are subscribed to the timeline.
 * This is not required for Plexamp clients as they do not subscribe nor send wait=1 when calling poll.get and will receive the timeline updates as response to the poll request.
 * This is required for all other clients that subscribe to the timeline via /timeline/subscribe or /timeline/poll with wait=1.
 * The timeline is published every second to all subscribers of the players.
 *
 * This is probably LEGACY functionality for Plex web player and other clients that subscribe to the timeline.
 *
 */
export async function runPublishTimeline() {
  const storage = useStorage('DISCOVERY')
  const builder = new Builder()
  try {
    logger.debug('Publishing timeline to all available subscribers ..')

    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      logger.debug('No LMS found in storage, skipping')
      return
    }

    const allPlayers: [string, IPlayerInfo][] = [] // Array of tuples (serverId, IPlayerInfo)

    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      logger.debug(`Found ${playerInfos?.length || 0} players for server '${key}'`)
      const serverId = key.split(':')[1] // e.g. players:de443cee-943b-421a-8db3-575e5b4cddc6 where the later is the serverId
      if (playerInfos) {
        for (const player of playerInfos) {
          allPlayers.push([serverId, player])
        }
      }
    }

    await Promise.all(
      allPlayers.map(async ([serverId, playerInfo]) => {
        const subscriberKeys = await storage.getKeys(`subscribers/${playerInfo.playerid}`)
        if (!subscriberKeys || subscriberKeys.length === 0) {
          logger.debug(`No subscribers found for player ${playerInfo.playerid}, skipping`)
          return
        }
        const playerSubscribers: RemoteSubscriber[] = []
        for (const key of subscriberKeys) {
          const subscriber = await storage.getItem<RemoteSubscriber>(key)
          if (subscriber) {
            // Check if subscriber is older than 10 seconds and remove it
            const TEN_SECONDS = 10 * 1000
            if (Date.now() - new Date(subscriber.subscribedAt).getTime() > TEN_SECONDS) {
              logger.info(`Removing stale subscriber ${subscriber.clientIdentifier}`)
              await storage.removeItem(key)
              continue
            }

            playerSubscribers.push(subscriber)
          }
        }

        // resolve player status and send timeline to all subscribers
        logger.debug(`Publishing timeline to ${playerSubscribers.length} subscribers for player ${playerInfo.playerid} ..`)
        const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
        if (!serverInfo || !serverInfo.ip) {
          throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
        }
        const player = await useSqueezePlayer(serverInfo, playerInfo)
        const playerStatus = await player.status()
        if (!playerStatus) {
          throw new Error(`Player ${playerInfo.playerid} status available yet`)
        }

        const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
        if (!playerQueue) {
          logger.debug(`No playerQueue available for player ${playerInfo.playerid}, skipping timeline subscriber update ..`)
          return
        }

        const serverTimelineUrl = `http://${playerQueue.plexServer.server.localAddress}:${playerQueue.plexServer.server.port}/:/timeline`
        for (const subscriber of playerSubscribers || []) {
          const timeline = await timelineResponse(playerStatus, subscriber, playerQueue, true)
          const timelineString = builder.buildObject(timeline)
          await Promise.all(
            timeline.MediaContainer.Timeline.map(async (timelineItem) => {
              logger.debug(`Sending timeline '${timelineItem.$.itemType}' to subscriber '${subscriber.deviceName}' ..`)

              if (
                !timelineItem.$.state ||
                !timelineItem.$.time ||
                !timelineItem.$.key ||
                !timelineItem.$.type ||
                !timelineItem.$.ratingKey ||
                !timelineItem.$.playQueueID ||
                !timelineItem.$.playQueueVersion ||
                !timelineItem.$.duration ||
                !timelineItem.$.playQueueItemID ||
                !timelineItem.$.containerKey
              ) {
                logger.debug(
                  `Missing required parameters for timeline '${timelineItem.$.itemType}' for subscriber '${subscriber.deviceName} / ${subscriber.clientIdentifier}', skip timeline update.`
                )
                return
              }
              logger.debug(
                `Sending update: ${timelineItem.$.state} / ${timelineItem.$.time} / ${timelineItem.$.key} / ${timelineItem.$.type} / ${timelineItem.$.ratingKey} / ${timelineItem.$.playQueueID} / ${timelineItem.$.duration} / ${timelineItem.$.playQueueItemID} / ${timelineItem.$.containerKey}`
              )
              const url = new URL(serverTimelineUrl)
              url.searchParams.append('commandID', timeline.MediaContainer.$.commandID)
              url.searchParams.append('state', timelineItem.$.state)
              url.searchParams.append('key', timelineItem.$.key)
              url.searchParams.append('type', timelineItem.$.type)
              url.searchParams.append('ratingKey', timelineItem.$.ratingKey)
              url.searchParams.append('playQueueID', timelineItem.$.playQueueID)
              url.searchParams.append('playQueueVersion', timelineItem.$.playQueueVersion)
              url.searchParams.append('duration', timelineItem.$.duration.toString())
              url.searchParams.append('playbackTime', timelineItem.$.time.toString())
              url.searchParams.append('time', timelineItem.$.time.toString())
              url.searchParams.append('playQueueItemID', timelineItem.$.playQueueItemID)
              url.searchParams.append('containerKey', timelineItem.$.containerKey)
              url.searchParams.append('hasMDE', '1')
              url.searchParams.append('includeFields', 'thumbBlurHash')

              const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'application/xml')
              headers.append('X-Plex-Token', playerQueue.plexServer.token)
              await axios
                .post(url.toString(), timelineString, {
                  headers: Object.fromEntries(headers.entries())
                })
                .catch(async (error) => {
                  logger.error(
                    `Failed to update timeline '${timelineItem.$.itemType}' for subscriber ${subscriber.deviceName} / ${subscriber.clientIdentifier}, unsubscribe from squeezePlexHub: ${error.message}`
                  )
                  await storage.removeItem(`subscribers/${playerInfo.playerid}/${subscriber.clientIdentifier}`)
                  return
                })
            })
          )
        }
      })
    )
  } catch (error) {
    logger.error(`Error when publishing player timelines`, error)
  }
}
