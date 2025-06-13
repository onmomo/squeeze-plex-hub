import { useScheduler } from '#scheduler'
import useLogger from '../composables/useLogger'
import { SqueezeServerStub } from 'lms-squeeze-rpc-x'
import ExtendedSqueezePlayer from '../lib/squeezePlayer'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import type { ServerInfo } from 'lms-discovery'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'
import axios from 'axios'
import { type PlayerPlayQueue, timelineResponse } from '../lib/plexPlayerTimeline'
import { Builder } from 'xml2js'
import { responseHeaders } from '../lib/plexApi'

const logger = useLogger('timelinePublisher')
const storage = useStorage('DISCOVERY')
const scheduler = useScheduler()

export default defineNitroPlugin(() => {
  publishTimeline()
})

/**
 * Publishes the timeline to the players to all plex clients that are subscribed to the timeline.
 */
function publishTimeline() {
  const builder = new Builder()
  scheduler
    .run(async () => {
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
          const serverId = key.split(':')[1] // e.g. players:de443cee-943b-421a-8db3-575e5b4cddc6 where the later is the serverId
          if (playerInfos) {
            for (const player of playerInfos) {
              allPlayers.push([serverId, player])
            }
          }
        }

        allPlayers.forEach(async ([serverId, playerInfo]) => {
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
          const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
          const player = new ExtendedSqueezePlayer(serverStub, playerInfo)
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
            const timeline = await timelineResponse(playerStatus, subscriber, playerQueue, true) // TODO support includeMetadata
            const timelineString = builder.buildObject(timeline)
            timeline.MediaContainer.Timeline.forEach(async (timelineItem) => {
              logger.debug(`Sending timeline '${timelineItem.$.itemType}' to subscriber ${subscriber.deviceName} ..`)

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
                  `Missing required parameters for timeline '${timelineItem.$.itemType}' for subscriber ${subscriber.deviceName} / ${subscriber.clientIdentifier}, skip timeline update.`
                )
                return
              }
              logger.debug(
                `sending update: ${timelineItem.$.state} / ${timelineItem.$.time} / ${timelineItem.$.key} / ${timelineItem.$.type} / ${timelineItem.$.ratingKey} / ${timelineItem.$.playQueueID} / ${timelineItem.$.duration} / ${timelineItem.$.playQueueItemID} / ${timelineItem.$.containerKey}`
              )
              const url = new URL(serverTimelineUrl)
              url.searchParams.append('commandID', timeline.MediaContainer.$.commandID) // TODO why is it required to have query params instead of the xml body?
              url.searchParams.append('state', timelineItem.$.state) // TODO why is it required to have query params instead of the xml body?
              url.searchParams.append('key', timelineItem.$.key)
              url.searchParams.append('type', timelineItem.$.type)
              url.searchParams.append('ratingKey', timelineItem.$.ratingKey)
              url.searchParams.append('playQueueID', timelineItem.$.playQueueID)
              url.searchParams.append('playQueueVersion', timelineItem.$.playQueueVersion)
              url.searchParams.append('duration', timelineItem.$.duration.toString())
              url.searchParams.append('playbackTime', timelineItem.$.time.toString()) // this vs time? why was this introduced by Plex Controller?
              url.searchParams.append('time', timelineItem.$.time.toString())
              url.searchParams.append('playQueueItemID', timelineItem.$.playQueueItemID)
              url.searchParams.append('containerKey', timelineItem.$.containerKey)
              url.searchParams.append('hasMDE', '1')
              url.searchParams.append('includeFields', 'thumbBlurHash')              

              const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'application/xml')
              headers.append('X-Plex-Token', playerQueue.plexServer.token)
              // this will send the player timeline to plex server to indicate the current playback status
              await axios
                .post(url.toString(), timelineString, {
                  headers: Object.fromEntries(headers.entries())
                })
                .catch(async (error) => {
                  logger.error(
                    `Failed to update timeline '${timelineItem.$.itemType}' for subscriber ${subscriber.deviceName} / ${subscriber.clientIdentifier}, unsubscribe from squeezePlexHub: ${error.message}`
                  )
                  await storage.removeItem(`subscribers/${playerInfo.playerid}/${subscriber.clientIdentifier}`)
                  // abort if one timeline fails to send
                  return
                })
            })
            //logger.info(`Sending timeline to subscriber ${subscriber.deviceName} @ ${subscriber.address} ..`)
            //url.searchParams.append('url', musicTimeline.$.url) // TODO what value is here actually required?   artwork URL?
            //url.searchParams.append('source', 'local') // TODO there must be another parameter to map it to source= on the controller it seems

            //state=playing&duration=380906&time=89249&playQueueItemID=583873&key=/library/metadata/35460&ratingKey=35460&playQueueID=7570&playQueueVersion=1&contai

            //logger.info(`Sending headers: ${JSON.stringify(headers)}`)

            //const body = builder.buildObject(xmlBody)
          }
        })
      } catch (error) {
        logger.error(`Error when publishing timeline`, error)
      }
    })
    .everySeconds(1)
}
