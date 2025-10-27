import type { PlayerStatus } from './squeezePlayer'
import useLogger from '../composables/useLogger'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'
import type { PlexServer } from './plexApi'
import { plexOptions } from './squeezePlexHub'

const logger = useLogger('plexPlayerTimeline')

// interface for playlist
export interface PlayerPlayQueue {
  // The loaded playQueue of the player
  playQueue: PlayQueue
  // The plex server that hosts the playQueue
  plexServer: PlexServer
  // The player id of the player that loaded the playQueue
  playerId: string
}

export interface PlayQueue {
  MediaContainer: MediaContainer
}

export interface MediaContainer {
  $: {
    size: string
    identifier: string
    mediaTagPrefix: string
    mediaTagVersion: string
    playQueueID: string
    playQueueLastAddedItemID: string
    playQueueSelectedItemID: string
    playQueueSelectedItemOffset: string
    playQueueSelectedMetadataItemID: string
    playQueueShuffled: string
    playQueueSourceURI: string
    playQueueTotalCount: string
    playQueueVersion: string
  }
  Track: Track[]
}

export interface Track {
  $: {
    playQueueItemID: string
    ratingKey: string
    key: string
    parentRatingKey: string
    grandparentRatingKey: string
    guid: string
    parentGuid: string
    grandparentGuid: string
    parentStudio: string
    type: string
    title: string
    grandparentKey: string
    parentKey: string
    librarySectionTitle: string
    librarySectionID: string
    librarySectionKey: string
    grandparentTitle: string
    parentTitle: string
    summary: string
    index: string
    parentIndex: string
    ratingCount: string
    viewCount: string
    lastViewedAt: string
    parentYear: string
    thumb: string
    art: string
    parentThumb: string
    grandparentThumb: string
    grandparentArt: string
    duration: string
    addedAt: string
    updatedAt: string
    musicAnalysisVersion: string
  }
  Media: Media[]
  Image: Image[]
  Guid: Guid[]
  Genre?: Genre[]
  Mood?: Mood[]
}

export interface Media {
  $: {
    id: string
    duration: string
    bitrate: string
    audioChannels: string
    audioCodec: string
    container: string
    hasVoiceActivity: string
  }
  Part: Part[]
}

export interface Part {
  $: {
    id: string
    key: string
    duration: string
    file: string
    size: string
    container: string
    hasThumbnail: string
  }
  Stream: Stream[]
}

export interface Stream {
  $: {
    id: string
    streamType: string
    selected: string
    codec: string
    index: string
    channels: string
    bitrate: string
    albumGain?: string
    albumPeak?: string
    albumRange?: string
    audioChannelLayout?: string
    bitDepth?: string
    displayTitle: string
    extendedDisplayTitle: string
    gain?: string
    loudness?: string
    lra?: string
    peak?: string
    samplingRate: string
    startRamp?: string
    endRamp?: string
    format?: string
    key?: string
    provider?: string
  }
}

export interface Image {
  $: {
    alt: string
    type: string
    url: string
  }
}

export interface Guid {
  $: {
    id: string
  }
}

export interface Genre {
  $: {
    id: string
    filter: string
    tag: string
  }
}

export interface Mood {
  $: {
    id: string
    filter: string
    tag: string
  }
}

// interfaces for timeline xml
export interface TimelineContainer {
  MediaContainer: {
    $: {
      commandID: string
    }
    Timeline: Timeline[]
  }
}

export interface Timeline {
  $: {
    state: string
    type: string
    itemType: string
    volume: string
    controllable: string
    time: string
    duration?: string
    shuffle?: string
    repeat?: string
    mute?: string
    playQueueItemID?: string
    key?: string
    ratingKey?: string
    playQueueID?: string
    playQueueVersion?: string
    containerKey?: string
    machineIdentifier?: string
    protocol?: string
    address?: string
    port?: string
  }
  Track?: Track
}

const timelineContainer = (
  playerStatus: PlayerStatus,
  subscriber: RemoteSubscriber,
  playerQueue?: PlayerPlayQueue,
  includeMetadata?: boolean,
  buffering: boolean = false
) => {
  const currentTrack = findCurrentTrack()

  return {
    MediaContainer: {
      $: {
        commandID: subscriber.commandId
      },
      Timeline: [
        {
          $: {
            state: state(),
            duration: Math.round(playerStatus.duration * 1000).toString(), // the total duration of the track in ms
            time: Math.round(playerStatus.time * 1000).toString(), // the current time of the track playing in ms
            playQueueItemID: currentTrack?.$.playQueueItemID,
            key: currentTrack?.$.key,
            ratingKey: currentTrack?.$.ratingKey,
            playQueueID: playerQueue?.playQueue?.MediaContainer.$.playQueueID,
            playQueueVersion: playerQueue?.playQueue?.MediaContainer.$.playQueueVersion,
            containerKey: playlistKey(),
            type: 'music',
            itemType: 'music',
            volume: volume(),
            mute: mute(),
            shuffle: playerQueue?.playQueue?.MediaContainer.$.playQueueShuffled, // TODO implement shuffle mode properly
            repeat: playerStatus.repeat.toString(),
            controllable: plexOptions.controllable,
            machineIdentifier: playerQueue?.plexServer?.server.resourceIdentifier, // THIS IS ESSENTIAL TO GET THE TIMELINE TO WORK, needs to reflect the serverId of the server that hosts the playQueue. All the server information must match with what was received in createPlayeQueue request
            protocol: playerQueue?.plexServer?.server.protocol,
            address: playerQueue?.plexServer?.server.localAddress,
            port: playerQueue?.plexServer?.server.port.toString()
          },
          ...(includeMetadata && currentTrack ? { Track: currentTrack } : {}) // THIS IS ESSENTIAL since Plexamp struggles with </Track> tag if no playQueue is loaded
        },
        createEmptyTimeline('video', playerStatus),
        createEmptyTimeline('photo', playerStatus)
      ]
    }
  }

  function playlistKey() {
    return playerQueue?.playQueue ? `/playQueues/${playerQueue.playQueue.MediaContainer.$.playQueueID}` : undefined
  }

  function findCurrentTrack() {
    if (buffering) return undefined // do not return a track while buffering to avoid Plexamp showing wrong track info
    return playerQueue?.playQueue?.MediaContainer.Track?.[playerStatus.playlist_cur_index] ?? undefined
  }

  /**
   * Plex accepts one of the following states: stopped, paused, playing, buffering, error.
   * Whereas LMS has play, pause, stop, and mode undefined == off.
   * @returns one of stopped, paused, playing, buffering
   */
  function state() {
    if (buffering) {
      return 'buffering' // Plexamp will show a loading indicator
    }
    switch (playerStatus.mode) {
      case 'play':
        return 'playing'
      case 'pause':
        return 'paused'
      default:
        return 'stopped'
    }
  }

  /**
   * volume is a number between 0 and 100. If volume is negative, the player is muted
   */
  function volume() {
    return playerStatus.volume < 0 ? '0' : playerStatus.volume.toString()
  }

  /**
   * If volume is negative, the player is muted
   */
  function mute() {
    return playerStatus.volume < 0 ? '1' : '0'
  }

  function createEmptyTimeline(type: string, playerStatus: PlayerStatus): Timeline {
    return {
      $: {
        type,
        itemType: type,
        state: 'stopped',
        time: Math.round(playerStatus.time * 1000).toString(), // the current time of the track playing in ms
        volume: volume(),
        controllable: plexOptions.controllable
      }
    }
  }
}

export async function timelineResponse(
  playerStatus: PlayerStatus,
  subscriber: RemoteSubscriber,
  playerQueue?: PlayerPlayQueue,
  includeMetadata?: boolean,
  buffering: boolean = false
): Promise<TimelineContainer> {
  logger.debug(
    `Generating timeline line XML for playqueue ${playerQueue?.playQueue.MediaContainer.$.playQueueID}, server ${playerQueue?.plexServer.server.localAddress} and player ${playerQueue?.playerId} ..`
  )
  return timelineContainer(playerStatus, subscriber, playerQueue, includeMetadata, buffering)
}

/**
 * Get the index of a track in the play queue by its playQueueItemID
 * @param queue current player queue
 * @param playQueueItemID the playQueueItemID of the track
 * @returns -1 if not found, otherwise the 0-based index of the item in the play queue
 */
export function getTrackIndexByPlayQueueItemID(queue: PlayerPlayQueue, playQueueItemID: string): number {
  const tracks = queue.playQueue?.MediaContainer?.Track ?? []
  return tracks.findIndex((t) => t.$.playQueueItemID === playQueueItemID)
}
