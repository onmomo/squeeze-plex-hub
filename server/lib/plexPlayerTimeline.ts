import { Builder } from 'xml2js'
import type { PlayerStatus } from '~/server/lib/squeezePlayer'
import type { PlexPlayQueue, PlexTrack } from '../routes/player/playback/playMedia.get'
import useLogger from '../composables/useLogger'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'

const logger = useLogger('plexPlayerTimeline')
const storage = useStorage('DISCOVERY')

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





<!-- GET /player/timeline/poll?wait=0&includeMetadata=1&commandID=346&type=music HTTP/1.1 -->
<MediaContainer commandID="346">
<Timeline state="playing" duration="302013" time="224245" playQueueItemID="582408" key="/library/metadata/40900"
          ratingKey="40900" playQueueID="7509" playQueueVersion="5" containerKey="/playQueues/7509" type="music"
          itemType="music" volume="100" shuffle="0" repeat="0"
          controllable="volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause,shuffle,skipNext"
          machineIdentifier="db8490d1d364f23ae031ccf6f1e4cdd3baeb228e" protocol="https"
          address="10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct" port="32400">
    <Track playQueueItemID="582408" ratingKey="40900" key="/library/metadata/40900" parentRatingKey="40888"
           grandparentRatingKey="40887" guid="local://40900" parentGuid="local://40888"
           grandparentGuid="plex://artist/5d07bf25403c64029071b92d" type="track" title="Save You with My Love"
           grandparentKey="/library/metadata/40887" parentKey="/library/metadata/40888" librarySectionTitle="Music"
           librarySectionID="1" librarySectionKey="/library/sections/1" grandparentTitle="TheCityIsOurs"
           parentTitle="COMA" summary="" index="12" parentIndex="1" viewCount="20" skipCount="1"
           lastViewedAt="1739294768" parentYear="2021" thumb="/library/metadata/40888/thumb/1672307105"
           parentThumb="/library/metadata/40888/thumb/1672307105"
           grandparentThumb="/library/metadata/40887/thumb/1710899270" duration="302013" addedAt="1672307103"
           musicAnalysisVersion="1" source="db8490d1d364f23ae031ccf6f1e4cdd3baeb228e">
        <Media id="40244" duration="302013" bitrate="981" audioChannels="2" audioCodec="flac" container="flac"
               hasVoiceActivity="0">
            <Part id="40608" key="/library/parts/40608/1634904934/file.flac" duration="302013"
                  file="/volume1/music/lossless/off-site/other/TheCityIsOurs - Coma (2021) FLAC/12 - Save You with My Love.flac"
                  size="37060561" container="flac" hasThumbnail="1">
                <Stream id="91959" streamType="2" selected="1" codec="flac" index="0" channels="2" bitrate="981"
                        albumGain="-11.26" albumPeak="0.996246" albumRange="6.899354" audioChannelLayout="stereo"
                        bitDepth="16"
                        endRamp="-51.00 0.11;-39.62 1.71;-29.30 3.01;-23.93 4.11;-20.90 5.11;-17.98 6.01;-14.97 6.81;-11.96 8.31;-8.87 9.81;-5.81 11.81;-2.87 14.01;0.21 16.41;3.12 19.71;6.05 23.71;"
                        gain="-11.26" loudness="-7.13" lra="8.77" peak="0.996216" samplingRate="44100"
                        startRamp="-51.00 0.00;-39.48 2.00;-29.66 2.60;-23.98 3.10;-19.91 3.40;-17.27 3.70;-13.95 4.00;-10.53 4.30;-7.77 4.50;-3.51 4.70;-1.94 4.90;0.42 5.20;3.86 21.60;7.95 22.80;"
                        displayTitle="FLAC (Stereo)" extendedDisplayTitle="FLAC (Stereo)"/>
                <Stream id="91971" key="/library/streams/91971" streamType="4" codec="txt" format="txt"
                        provider="com.plexapp.agents.lyricfind" displayTitle="TXT"
                        extendedDisplayTitle="TXT (External)"/>
            </Part>
        </Media>
    </Track>
</Timeline>
<Timeline type="video" state="stopped"/>
<Timeline type="photo" state="stopped"/>
    </MediaContainer>



 *
 */
/**
 * Generates the resources XML based on a set of players.
 */


// TODO refactor to use js objects instead of xml 
// https://github.com/Leonidas-from-XIV/node-xml2js?tab=readme-ov-file#so-you-wanna-some-json
export function timelineBody(
  playerStatus: PlayerStatus,
  subscriber: RemoteSubscriber, // TODO REMOVE
  playQueue: PlexPlayQueue | null,
  includeMetadata: boolean // TODO implement metadata
) {
  //logger.info(`Generating timeline XML for player ${JSON.stringify(playerStatus)} ..`)
  //logger.info(`Generating timeline XML for playQueue ${JSON.stringify(playQueue)} ..`)
  function findCurrentTrack() {
    return playQueue?.tracks[playerStatus.playlist_cur_index] ? playQueue.tracks[playerStatus.playlist_cur_index] : undefined
  }

  // TODO fetch from plex api /metadata/$key
  const metadata = (track?: PlexTrack) => {
    if (!track) return undefined
    return {
      $: {
        type: 'music',
        itemType: 'music',
        title: track.title,
        parentTitle: track.album,
        grandparentTitle: track.artist,
        key: track.key,
        ratingKey: track.ratingKey,
        guid: track.guid,
        playQueueItemID: track.playQueueItemID
      }
    }
  }

  const timeLineMusic = {
    $: {
      type: 'music',
      itemType: 'music',
      state: playerStatus.mode == 'play' ? 'playing' : 'stopped', // TODO map pause,stop and play, buffering and error
      playQueueID: playQueue?.id,
      playQueueVersion: playQueue?.playQueueVersion,
      containerKey: playQueue?.containerKey,
      key: findCurrentTrack()?.key,
      playQueueItemID: findCurrentTrack()?.playQueueItemID,
      audioStreamID: findCurrentTrack()?.streamId,
      guid: findCurrentTrack()?.guid,
      ratingKey: findCurrentTrack()?.ratingKey,
      time: Math.round(playerStatus.time * 1000), // the current time of the track playing in ms
      duration: Math.round((playerStatus.duration || 1) * 1000), // the total duration of the track in ms
      seekRange: `0-${Math.round((playerStatus.duration || 1) * 1000)}`,
      repeat: '0',
      mute: '0',
      volume: '50', // TODO
      shuffle: playQueue?.playQueueShuffled ? '1' : '0',
      //machineIdentifier: 'SqueezePlexHub', // this MUST match the clientIdentifier used to register SqueezePlexHub with Plex Server??
      machineIdentifier: playerStatus.playerId,
      //port: subscriber.plexServer?.port,
      //address: subscriber.plexServer?.host,
      //protocol: subscriber.plexServer?.protocol,
      //token: subscriber.plexServer?.token,
      controllable: 'volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause,shuffle,skipNext'
      //controllable: 'playPause,stop,skipPrevious,skipNext'
      //controllable: 'subtitleStream,videoStream,audioStream,shuffle,repeat,stop,playPause,stepBack,seekTo,stepForward,skipNext'
    },
    //Track: includeMetadata ? metadata(findCurrentTrack()) : undefined
  }

  function createEmptyTimeline(type: string) {
    return {
      $: {
        type,
        itemType: type,
        state: 'stopped',                
        mute: '0',
        shuffle: '0',        
        repeat: '0',        
        volume: '50', // TODO
        key: '',
        containerKey: '',
        guid: '',        
        ratingKey: '',
        time: '0',
        duration: '0',
        playQueueItemID: '',
        audioStreamID: '',
      }
    }
  }

  // TODO check how we can match the playerStatus to the playQueue
  const mediaContainer = {
    MediaContainer: {
      $: {        
        commandID: subscriber.commandId,
        location: 'fullScreenMusic',
        //location: 'navigation',
        //machineIdentifier: playerStatus.playerId
      },
      Timeline: [
        playQueue ? timeLineMusic : createEmptyTimeline('music'),
        createEmptyTimeline('video'),
        createEmptyTimeline('photo')
      ]
    }
  }

  const mediaContainerEmpty = {
    MediaContainer: {
      $: {
        commandID: subscriber.commandId,
        machineIdentifier: playerStatus.playerId,
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
  }
  //const builder = new Builder({ headless: true })  
  //return builder.buildObject(mediaContainer)
  return mediaContainer
}

export async function timelineResponse(playerStatus: PlayerStatus, subscriber: RemoteSubscriber, includeMetadata: boolean) {
  const playQueue = await storage.getItem<PlexPlayQueue>(`playerQueue/${playerStatus.playerId}`)
  return timelineBody(playerStatus, subscriber, playQueue, includeMetadata)
}

export function subscriberUrl(protocol: string, address: string): string {
  const subscriberTimelinePath = '/:/timeline'
  return `${protocol}://${address}${subscriberTimelinePath}`
}

export function playerResourcesUrl(protocol: string, address: string): string {
  const subscriberTimelinePath = '/resources'
  return `${protocol}://${address}${subscriberTimelinePath}`
}
