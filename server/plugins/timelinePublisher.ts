import { useScheduler } from '#scheduler'
import useLogger from '../composables/useLogger'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '../lib/squeezePlayer'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import type { ServerInfo } from 'lms-discovery'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'
import axios from 'axios'
import { timelineResponse } from '../lib/plexPlayerTimeline'
import { Builder } from 'xml2js'
import { type PlexServer, responseHeaders } from '../lib/plexApi'
import type { PlexServerResponse } from './gdmDiscovery'

const logger = useLogger('timelinePublisher')

export default defineNitroPlugin(() => {
  publishTimeline()
})

/**
 * Publishes the timeline to the players to all plex clients that are subscribed to the timeline.
 */
function publishTimeline() {
  const storage = useStorage('DISCOVERY')
  const credentials = useStorage('CREDENTIALS')
  const scheduler = useScheduler()
  const config = useRuntimeConfig()
  const builder = new Builder({ headless: true })
  scheduler
    .run(async () => {
      try {
        logger.debug('Publishing timeline to all available subscribers ..')
        const serverKeys = await storage.getKeys('players/')
        if (!serverKeys || serverKeys.length === 0) {
          throw new Error('No LMS found in storage, skipping')
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
          const remoteSubscribers: RemoteSubscriber[] = []
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

              remoteSubscribers.push(subscriber)
            }
          }

          // resolve player status and send timeline to all subscribers
          logger.debug(`Publishing timeline to ${remoteSubscribers.length} subscribers for player ${playerInfo.playerid} ..`)
          const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
          if (!serverInfo || !serverInfo.ip) {
            throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
          }
          const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
          var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
          const playerStatus = await player.status()
          if (!playerStatus) {
            throw new Error(`Player ${playerInfo.playerid} status available yet`)
          }

          const serverResponse = await storage.getItem<PlexServerResponse>(`plexServer`)
          if (!serverResponse) {
            throw new Error(`No plex server found in storage and playQueue not available`)
          }

          const serverTimelineUrl = `http://${serverResponse.localAddress}:${serverResponse.port}/:/timeline`
          const token = (await credentials.getItem<string>('plexToken')) || config.plexToken
          if (!token) {
            logger.warn('No plex token available, abort timeline subscriber update. Please ensure to authenticate Squeeze Plex Hub.')
            throw new Error(`No Plex token found in storage`)
          }

          const plexServer: PlexServer = {
            host: serverResponse.localAddress,
            port: serverResponse.port.toString(),
            protocol: 'http',
            token: token
          }

          for (const subscriber of remoteSubscribers || []) {
            const timelineRoot = await timelineResponse(playerStatus, subscriber, plexServer, true) // TODO support includeMetadata
            const xmlString = builder.buildObject(timelineRoot)
            //const xmlBody = await new Parser().parseStringPromise(xmlString)
            const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'text/xml')
            headers.append('X-Plex-Token', token)

            timelineRoot.MediaContainer.Timeline.forEach(async (timeline) => {
              logger.debug(`Sending timeline '${timeline.$.itemType}' to subscriber ${subscriber.deviceName} ..`)

              if (
                !timeline.$.state ||
                !timeline.$.time ||
                !timeline.$.key ||
                !timeline.$.type ||
                !timeline.$.ratingKey ||
                !timeline.$.playQueueID ||
                !timeline.$.duration ||                
                !timeline.$.playQueueItemID ||
                !timeline.$.containerKey
              ) {
                logger.debug(
                  `Missing required parameters for timeline '${timeline.$.itemType}' for subscriber ${subscriber.deviceName} / ${subscriber.clientIdentifier}, skip timeline update.`
                )
                return
              }
              logger.info(
                `sending update: ${timeline.$.state} / ${timeline.$.time} / ${timeline.$.key} / ${timeline.$.type} / ${timeline.$.ratingKey} / ${timeline.$.playQueueID} / ${timeline.$.duration} / ${timeline.$.playQueueItemID} / ${timeline.$.containerKey}`
              )
              const url = new URL(serverTimelineUrl)
              url.searchParams.append('commandID', timelineRoot.MediaContainer.$.commandID) // TODO why is it required to have query params instead of the xml body?!
              url.searchParams.append('state', timeline.$.state) // TODO why is it required to have query params instead of the xml body?!
              url.searchParams.append('key', timeline.$.key)
              url.searchParams.append('type', timeline.$.type)
              url.searchParams.append('ratingKey', timeline.$.ratingKey)
              url.searchParams.append('playQueueID', timeline.$.playQueueID)
              url.searchParams.append('duration', timeline.$.duration.toString())
              url.searchParams.append('playbackTime', timeline.$.time.toString()) // this vs time? why was this introduced by Plex Controller?
              url.searchParams.append('time', timeline.$.time.toString())
              url.searchParams.append('playQueueItemID', timeline.$.playQueueItemID)
              url.searchParams.append('containerKey', timeline.$.containerKey)
              //url.searchParams.append('guid', timeline.$.guid) // TODO why is it required to have query params instead of the xml body?!

              await axios
                .post(url.toString(), xmlString, {
                  headers: Object.fromEntries(headers.entries())
                })
                .catch(async (error) => {
                  logger.error(
                    `Failed to update timeline '${timeline.$.itemType}' for subscriber ${subscriber.deviceName} / ${subscriber.clientIdentifier}, unsubscribe from squeezePlexHub: ${error.message}`
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
