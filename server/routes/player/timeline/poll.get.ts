import useLogger from '~/server/composables/useLogger'
import { Builder } from 'xml2js'
import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'
import type { PlexPlayQueue } from '../playback/playMedia.get'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { PlayerStatus } from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'

const logger = useLogger('timeline.poll.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  //const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  let commandId = query.commandID !== undefined ? parseInt(query.commandID as string) : undefined
  const wait = query.wait as string | undefined

/**
 * GET /player/timeline/poll?wait=1&includeMetadata=1&commandID=376&type=music HTTP/1.1
Host: 10.0.1.107:3000
 */
  

  if (!targetClientIdentifier || commandId === undefined) {
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier' header and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }

  if (wait === '1') {
    // this parameter seems to indicate that the client does not want to have an quick response?!
    // responsing without a delay would result into a loop with PMS web app and crash
    // plexamp seems to respond in about 1000ms, so let's copy this here
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } else {
    commandId + 1 // TODO is is most likely also wrong. Need to understand who is responsible for counting commandId up and what is the expected behavior if wait=1 is sent to the poll api
  }

  logger.debug(`Polling player ${targetClientIdentifier} status ..: ${JSON.stringify(event.node.req.headers)}`)
  try {
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

    const playerServerTuple = allPlayers.find(([_, p]) => p.playerid === targetClientIdentifier)
    if (!playerServerTuple) {
      throw new Error(`Player not found in storage for playMedia`)
    }

    const [serverId, playerInfo] = playerServerTuple // Extract key and playerInfo

    const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
    if (!serverInfo || !serverInfo.ip) {
      throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
    }

    const playQueue = await storage.getItem<PlexPlayQueue>(`playerQueue/${playerInfo.playerid}`)

    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Player ${targetClientIdentifier} status available yet`)
    }
    
    const playerPollStatus = resourcesXml(playerStatus, commandId, playQueue)
    return event.respondWith(new Response(playerPollStatus, { status: 200, headers: { 'Content-Type': 'text/xml' } }))
    //event.node.res.setHeader('Content-Type', 'text/xml')
    //return send(event, playerPollStatus);
  } catch (error) {
    logger.warn(`Error when polling for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})

/**
 * <MediaContainer commandID="0" location="navigation">
    <Timeline state="stopped" type="video"/>
    <Timeline address="ss10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct" audioStreamID="50547" containerKey="/playQueues/7343" controllable="subtitleStream,videoStream,audioStream,shuffle,repeat,stop,playPause,stepBack,seekTo,stepForward,skipNext" duration="370455" key="/library/metadata/38728" machineIdentifier="db8490d1d364f23ae031ccf6f1e4cdd3baeb228e" playQueueID="7343" playQueueItemID="579558" playQueueVersion="2" port="32400" protocol="https" providerIdentifier="com.plexapp.plugins.library" ratingKey="38728" repeat="0" shuffle="1" state="paused" time="2110" type="music"/>
    <Timeline state="stopped" type="photo"/>
</MediaContainer>

 */

/**
 * <MediaContainer commandID="0" location="navigation">
<Timeline state="stopped" type="video" />
<Timeline state="stopped" type="music" />
<Timeline state="stopped" type="photo" />
</MediaContainer>

 */

/**
 * <MediaContainer commandID="1" location="navigation">
    <Timeline state="stopped" type="video"/>
    <Timeline address="ss10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct" audioStreamID="3497" containerKey="/playQueues/7461" controllable="subtitleStream,videoStream,audioStream,shuffle,repeat,stop,playPause,stepBack,seekTo,stepForward,skipNext" duration="362381" key="/library/metadata/3909" machineIdentifier="db8490d1d364f23ae031ccf6f1e4cdd3baeb228e" playQueueID="7461" playQueueItemID="582171" playQueueVersion="2" port="32400" protocol="https" providerIdentifier="com.plexapp.plugins.library" ratingKey="3909" repeat="0" shuffle="1" state="playing" time="24969" type="music"/>
    <Timeline state="stopped" type="photo"/>
</MediaContainer>

 */

/**
 * 
 * 
 * 
 * PLEXAMP iPhone
 * 
 * /devices
 *  <Server name="iPhone" host="10.0.1.124" address="10.0.1.124" port="51468" machineIdentifier="654bb235-3feb-46d9-be7e-989af5c96190" version="4.11.5" protocol="plex" product="Plexamp" deviceClass="mobile" protocolVersion="1" protocolCapabilities="timeline,playback,playqueues,playqueues-creation"/>
 * 
 * /poll
 * <MediaContainer commandID="1">
    <Timeline state="playing" duration="241856" time="13000" playQueueItemID="582296" key="/library/metadata/40213" ratingKey="40213" playQueueID="7499" playQueueVersion="2" containerKey="/playQueues/7499" type="music" itemType="music" volume="0" shuffle="1" repeat="0" controllable="volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause,shuffle,skipNext" machineIdentifier="db8490d1d364f23ae031ccf6f1e4cdd3baeb228e" protocol="https" address="10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct" port="32400"/>
    <Timeline type="video" state="stopped"/>
    <Timeline type="photo" state="stopped"/>
</MediaContainer>



 * 
 */

/**
 * squezeplexhub:
 * <MediaContainer commandID="1">
    <Timeline type="music" itemType="music" state="playing" playQueueID="7506" playQueueVersion="1" containerKey="/playQueues/7506" key="/library/metadata/3907" playQueueItemID="582325" audioStreamID="3495" guid="plex://track/5d07f660403c64029053a293" ratingKey="3907" time="0" duration="226000" repeat="0" volume="0" shuffle="1" machineIdentifier="SqueezePlexHub" port="32400" address="10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct" protocol="https" controllable="volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause,shuffle,skipNext"/>
    <Timeline type="photo" state="stopped"/>
    <Timeline type="video" state="stopped"/>
</MediaContainer>

 * 
 */

/**
 * Generates the resources XML based on a set of players.
 */
function resourcesXml(playerStatus: PlayerStatus, commandID: number, playQueue: PlexPlayQueue | null): string {
  //logger.info(`Generating timeline XML for player ${JSON.stringify(playerStatus)} ..`)
  logger.info(`Generating timeline XML for playQueue ${JSON.stringify(playQueue)} ..`)

  function findCurrentTrack() {
    return playQueue?.tracks[playerStatus.playlist_cur_index] ? playQueue.tracks[playerStatus.playlist_cur_index] : undefined
  }

  const timeLineQueue = {
    $: {
      type: 'music',
      itemType: 'music',
      state: playerStatus.mode == 'play' ? 'playing' : 'stopped', // TODO map pause,stop and play
      playQueueID: playQueue?.id,
      playQueueVersion: playQueue?.playQueueVersion,
      containerKey: playQueue?.containerKey,
      key: findCurrentTrack()?.key,
      playQueueItemID: findCurrentTrack()?.playQueueItemID,
      audioStreamID: findCurrentTrack()?.streamId,
      guid: findCurrentTrack()?.guid,
      ratingKey: findCurrentTrack()?.ratingKey,
      time: playerStatus.time * 1000, // the current time of the track playing in ms
      duration: (playerStatus.duration || 0) * 1000, // the total duration of the track in ms
      repeat: '0',
      volume: '0', // TODO
      shuffle: playQueue?.playQueueShuffled ? '1' : '0',
      machineIdentifier: 'SqueezePlexHub', // this MUST match the clientIdentifier used to register SqueezePlexHub with Plex Server??
      port: '32400',
      address: '10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct', // TODO replace with real address
      protocol: 'https',
      controllable: 'volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause,shuffle,skipNext'
      //controllable: 'playPause,stop,skipPrevious,skipNext'
      //controllable: 'subtitleStream,videoStream,audioStream,shuffle,repeat,stop,playPause,stepBack,seekTo,stepForward,skipNext'
    }
  }

  function createEmptyTimeline(type: string) {
    return {
      $: {
        type,
        state: 'stopped'
      }
    }
  }

  // TODO check how we can match the playerStatus to the playQueue
  const mediaContainer = {
    MediaContainer: {
      $: {
        //size: '3',
        commandID,
        //location: 'fullScreenMusic',
        //location: 'navigation',
        //machineIdentifier: playerStatus.playerId
      },
      Timeline: [playQueue ? timeLineQueue : createEmptyTimeline('music'), createEmptyTimeline('video'), createEmptyTimeline('photo')]
    }
  }

  /* const mediaContainer = {
    MediaContainer: {
      $: {
        commandID,
        machineIdentifier: playerStatus.playerid,
        location: 'fullScreenMusic',
        size: '3'
      },
      Timeline: [
        {
          $: {
            type: 'music',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        },
        {
          $: {
            type: 'video',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        },
        {
          $: {
            type: 'photo',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        }
      ]
    }
  } */

  const builder = new Builder({ headless: true })
  return builder.buildObject(mediaContainer)
}
