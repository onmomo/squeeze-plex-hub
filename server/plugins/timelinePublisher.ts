import { useScheduler } from '#scheduler'
import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer, SqueezePlayer } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '../lib/squeezePlayer'
import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'
import type { ServerInfo } from 'lms-discovery'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'
import axios from 'axios'
import { timelineResponse } from '../lib/plexPayerTimeline'
import { plexOptions } from '../lib/squeezePlexHub'

const logger = useLogger('timelinePublisher')

export default defineNitroPlugin(() => {
  publishTimeline()
})

/**
 * Publishes the timeline to the players to all plex clients that are subscribed to the timeline.
 */
function publishTimeline() {
  const storage = useStorage('DISCOVERY')
  const scheduler = useScheduler()
  scheduler
    .run(async () => {
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
          logger.info(`No subscribers found for player ${playerInfo.playerid}, skipping`)
          return
        }
        const remoteSubscribers: RemoteSubscriber[] = []
        for (const key of subscriberKeys) {
          const subscriber = await storage.getItem<RemoteSubscriber>(key)
          if (subscriber) {
            remoteSubscribers.push(subscriber)
          }
        }

        // resolve player status and send timeline to all subscribers
        logger.info(`Publishing timeline to ${remoteSubscribers.length} subscribers for player ${playerInfo.playerid} ..`)
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
        for (const subscriber of remoteSubscribers || []) {
          const body = await timelineResponse(playerStatus, subscriber, true) // TODO support includeMetadata
          const state = playerStatus.mode == 'play' ? 'playing' : 'stopped'
          //logger.info(`Sending timeline to subscriber ${subscriber.deviceName} @ ${subscriber.address} ..`)
          const url = new URL(subscriber.address)          
          url.searchParams.append('state', 'playing') // TODO why is it required to have query params instead of the xml body?!
          url.searchParams.append('key', '/library/metadata/40900')
          url.searchParams.append('ratingKey', '40900')
          url.searchParams.append('playQueueID', '7509')
          url.searchParams.append('duration', '302013')
          url.searchParams.append('playbackTime', '224245') // this vs time? why was this introduced by Plex Controller?
          url.searchParams.append('time', '224245')
          url.searchParams.append('playQueueItemID', '582408')
          url.searchParams.append('containerKey', '/playQueues/7509')          
          url.searchParams.append('guid', 'local://40900')
          url.searchParams.append('url', '/library/metadata/40888/thumb/1672307105') // TODO what value is here actually required?   artwork URL?
          //url.searchParams.append('source', 'local') // TODO there must be another parameter to map it to source= on the controller it seems

          //state=playing&duration=380906&time=89249&playQueueItemID=583873&key=/library/metadata/35460&ratingKey=35460&playQueueID=7570&playQueueVersion=1&contai

          await axios
            .post(url.toString(), body, {
              headers: {
                'X-Plex-Token': subscriber.plexToken,
                'X-Plex-Client-Identifier': playerInfo.playerid,
                'X-Plex-Target-Client-Identifier': subscriber.clientIdentifier,
                'X-Plex-Device-Name': playerInfo.name,
                'X-Plex-Platform': plexOptions.platform,
                'X-Plex-Platform-Version': plexOptions.platformVersion,
                'X-Plex-Product': plexOptions.product,
                'X-Plex-Version': plexOptions.version,
                'X-Plex-Device': plexOptions.device,
                'X-Plex-Model': plexOptions.model,
                'Content-Type': 'application/xml',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Private-Network': 'true',
                'Access-Control-Max-Age': '1209600',
                'Access-Control-Expose-Headers': 'X-Plex-Client-Identifier',
                'X-Plex-Protocol': plexOptions.protocol,
                'X-Plex-Protocol-Version': plexOptions.protocolVersion
              }
            })
            .catch((error) => {
              logger.error(
                `Failed to send timeline to subscriber ${subscriber.deviceName} / ${subscriber.clientIdentifier} @ ${subscriber.address}, unsubscribe: ${error.message}`
              )
              storage.removeItem(`subscribers/${playerInfo.playerid}/${subscriber.clientIdentifier}`)
            })
        }
      })
    })
    .everySeconds(1)
}
