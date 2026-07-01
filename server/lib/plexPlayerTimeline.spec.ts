import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PlayerStatus } from './squeezePlayer'
import type { RemoteSubscriber } from '../routes/player/timeline/poll.get'
import type { PlexServer } from './plexApi'
import type { PlayerPlayQueue, PlayQueue, Track } from './plexPlayerTimeline'
import { plexOptions } from './squeezePlexHub'
import { timelineResponse } from './plexPlayerTimeline'

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    warn: vi.fn(),
    debug: vi.fn()
  })
}))

const mockSubscriber: RemoteSubscriber = {
  commandId: '123'
} as any

const mockPlexServer: PlexServer = {
  server: {
    resourceIdentifier: 'server-uuid',
    protocol: 'https',
    localAddress: '127.0.0.1',
    port: 32400
  }
} as any

const mockTrack: Track = {
  $: {
    playQueueItemID: '582408',
    ratingKey: '40900',
    key: '/library/metadata/40900',
    parentRatingKey: '40888',
    grandparentRatingKey: '40887',
    guid: 'local://40900',
    parentGuid: 'local://40888',
    grandparentGuid: 'plex://artist/5d07bf25403c64029071b92d',
    type: 'track',
    title: 'Save You with My Love',
    grandparentKey: '/library/metadata/40887',
    parentKey: '/library/metadata/40888',
    librarySectionTitle: 'Music',
    librarySectionID: '1',
    librarySectionKey: '/library/sections/1',
    grandparentTitle: 'TheCityIsOurs',
    parentTitle: 'COMA',
    summary: '',
    index: '12',
    parentIndex: '1',
    ratingCount: '0',
    viewCount: '20',
    lastViewedAt: '1739294768',
    parentYear: '2021',
    thumb: '/library/metadata/40888/thumb/1672307105',
    art: '',
    parentThumb: '/library/metadata/40888/thumb/1672307105',
    grandparentThumb: '/library/metadata/40887/thumb/1710899270',
    grandparentArt: '',
    duration: '302013',
    addedAt: '1672307103',
    updatedAt: '',
    musicAnalysisVersion: '1',
    parentStudio: ''
  },
  Media: [],
  Image: [],
  Guid: []
}

const mockPlayQueue: PlayQueue = {
  MediaContainer: {
    $: {
      size: '1',
      identifier: 'com.plexapp.plugins.library',
      mediaTagPrefix: '/system/bundle/media/flags/',
      mediaTagVersion: '168',
      playQueueID: '7509',
      playQueueLastAddedItemID: '582408',
      playQueueSelectedItemID: '582408',
      playQueueSelectedItemOffset: '0',
      playQueueSelectedMetadataItemID: '40900',
      playQueueShuffled: '1',
      playQueueSourceURI: '',
      playQueueTotalCount: '1',
      playQueueVersion: '5'
    },
    Track: [mockTrack]
  }
}

const mockPlayerQueue: PlayerPlayQueue = {
  playQueue: mockPlayQueue,
  plexServer: mockPlexServer,
  playerId: 'player-1'
}

describe('timelineContainer', () => {
  let playerStatus: PlayerStatus

  beforeEach(() => {
    playerStatus = {
      playerId: 'player-1',
      mode: 'play',
      time: 12.345,
      duration: 123.456,
      volume: 80,
      playlist_cur_index: 0,
      repeat: 2,
      shuffle: 1
    } as PlayerStatus
  })

  it('generates timeline with metadata when includeMetadata is true', async () => {
    const result = await timelineResponse(playerStatus, mockSubscriber, mockPlayerQueue, true)
    const timeline0 = result.MediaContainer.Timeline[0]!
    expect(result.MediaContainer.$.commandID).toBe(mockSubscriber.commandId)
    expect(timeline0.$.state).toBe('playing')
    expect(timeline0.$.duration).toBe('123456')
    expect(timeline0.$.time).toBe('12345')
    expect(timeline0.$.playQueueItemID).toBe('582408')
    expect(timeline0.$.key).toBe('/library/metadata/40900')
    expect(timeline0.$.playQueueID).toBe('7509')
    expect(timeline0.$.playQueueVersion).toBe('5')
    expect(timeline0.$.containerKey).toBe('/playQueues/7509')
    expect(timeline0.$.type).toBe('music')
    expect(timeline0.$.itemType).toBe('music')
    expect(timeline0.$.volume).toBe('80')
    expect(timeline0.$.mute).toBe('0')
    expect(timeline0.$.shuffle).toBe('1')
    expect(timeline0.$.repeat).toBe('2')
    expect(timeline0.$.controllable).toBe(plexOptions.controllable)
    expect(timeline0.$.machineIdentifier).toBe('server-uuid')
    expect(timeline0.$.protocol).toBe('https')
    expect(timeline0.$.address).toBe('127.0.0.1')
    expect(timeline0.$.port).toBe('32400')
    expect(timeline0.Track).toBeDefined()
    expect(result.MediaContainer.Timeline[1]!.$.type).toBe('video')
    expect(result.MediaContainer.Timeline[2]!.$.type).toBe('photo')
  })

  it('generates timeline without metadata when includeMetadata is false', async () => {
    const result = await timelineResponse(playerStatus, mockSubscriber, mockPlayerQueue, false)
    expect(result.MediaContainer.Timeline[0]!.Track).toBeUndefined()
  })

  it('sets state to paused when playerStatus.mode is pause', async () => {
    playerStatus.mode = 'pause'
    const result = await timelineResponse(playerStatus, mockSubscriber, mockPlayerQueue, true)
    expect(result.MediaContainer.Timeline[0]!.$.state).toBe('paused')
  })

  it('sets state to stopped when playerStatus.mode is stop', async () => {
    playerStatus.mode = 'stop'
    const result = await timelineResponse(playerStatus, mockSubscriber, mockPlayerQueue, true)
    expect(result.MediaContainer.Timeline[0]!.$.state).toBe('stopped')
  })

  it('sets mute to 1 and volume to 0 when playerStatus.volume is negative', async () => {
    playerStatus.volume = -1
    const result = await timelineResponse(playerStatus, mockSubscriber, mockPlayerQueue, true)
    expect(result.MediaContainer.Timeline[0]!.$.mute).toBe('1')
    expect(result.MediaContainer.Timeline[0]!.$.volume).toBe('0')
  })

  it('returns undefined keys if no playQueue is provided', async () => {
    const result = await timelineResponse(playerStatus, mockSubscriber, undefined, true)
    expect(result.MediaContainer.Timeline[0]!.$.playQueueID).toBeUndefined()
    expect(result.MediaContainer.Timeline[0]!.$.containerKey).toBeUndefined()
    expect(result.MediaContainer.Timeline[0]!.Track).toBeUndefined()
  })

  it('returns undefined for playQueueItemID if playlist_cur_index is out of bounds', async () => {
    playerStatus.playlist_cur_index = 99
    const result = await timelineResponse(playerStatus, mockSubscriber, mockPlayerQueue, true)
    expect(result.MediaContainer.Timeline[0]!.$.playQueueItemID).toBeUndefined()
    expect(result.MediaContainer.Timeline[0]!.Track).toBeUndefined()
  })
})
