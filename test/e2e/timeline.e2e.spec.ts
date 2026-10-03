import { describe, expect, it } from 'vitest'
import { parseStringPromise } from 'xml2js'
import type { TimelineContainer } from '../../server/lib/plexPlayerTimeline'
import { useE2eStack } from './harness'
import { TRACK_SECONDS } from './fakePlexServer'
import { PLEX_HOST, waitFor } from './lmsStack'

/**
 * The timeline Plexamp polls to show what the player does has to reflect the real LMS state.
 */
const TIME_TOLERANCE_MS = 250

describe('e2e: hub -> LMS timeline', () => {
  const e2e = useE2eStack()
  const { hubRequest, lmsStatus, partOf, playAlbumFrom, playQueueItemIdOf, waitForStatus, waitUntilPlaying } = e2e

  /** Polls the timeline like Plexamp does and returns the music timeline */
  async function pollMusicTimeline(includeMetadata = true) {
    const response = await hubRequest('/player/timeline/poll', {
      wait: '0',
      includeMetadata: includeMetadata ? '1' : '0',
      type: 'music',
      commandID: '10'
    })
    expect(response.status).toBe(200)
    const container: TimelineContainer = await parseStringPromise(await response.text())
    expect(container.MediaContainer.$.commandID).toBe('10')
    const timeline = container.MediaContainer.Timeline.find((t) => t.$.type === 'music')
    expect(timeline).toBeDefined()
    return timeline!
  }

  /** Polls until the music timeline matches, returns it */
  async function waitForTimeline(matches: (timeline: Awaited<ReturnType<typeof pollMusicTimeline>>) => boolean) {
    let timeline: Awaited<ReturnType<typeof pollMusicTimeline>> | undefined
    await waitFor(async () => matches((timeline = await pollMusicTimeline())), 15_000).catch((error) => {
      throw new Error(`Timeline did not match, last: ${JSON.stringify(timeline?.$)}`, { cause: error })
    })
    return timeline!
  }

  it('reports the playing track and position of the player', async () => {
    const playQueueId = await playAlbumFrom(3)
    await e2e.waitUntilPlayedPast(2)

    const before = await lmsStatus()
    const timeline = await pollMusicTimeline()
    const after = await lmsStatus()

    const track3 = e2e.track(3)
    expect(timeline.$).toMatchObject({
      state: 'playing',
      playQueueID: String(playQueueId),
      containerKey: `/playQueues/${playQueueId}`,
      playQueueItemID: String(playQueueItemIdOf(playQueueId, partOf(3))),
      ratingKey: track3.ratingKey,
      key: `/library/metadata/${track3.ratingKey}`,
      volume: String(before.volume),
      repeat: '0',
      machineIdentifier: 'fake-pms',
      protocol: 'http',
      address: PLEX_HOST,
      port: String(e2e.plex.port)
    })
    const time = Number(timeline.$.time)
    // LMS corrects its interpolated time with every player report, it may step back slightly
    expect(time).toBeGreaterThanOrEqual(Math.floor(before.time * 1000) - TIME_TOLERANCE_MS)
    expect(time).toBeLessThanOrEqual(Math.ceil(after.time * 1000) + TIME_TOLERANCE_MS)
    expect(Number(timeline.$.duration)).toBeCloseTo(TRACK_SECONDS * 1000, -2)
    expect(timeline.Track).toBeDefined()
    const track = Array.isArray(timeline.Track) ? timeline.Track[0] : timeline.Track
    expect(track.$).toMatchObject({ ratingKey: track3.ratingKey, title: track3.title })
  })

  it('omits the track metadata unless requested', async () => {
    await playAlbumFrom(1)

    const timeline = await pollMusicTimeline(false)
    expect(timeline.$.state).toBe('playing')
    expect(timeline.Track).toBeUndefined()
  })

  it('follows skips, seeks, pause and stop', async () => {
    const playQueueId = await playAlbumFrom(1)

    await hubRequest('/player/playback/skipTo', { playQueueItemID: String(playQueueItemIdOf(playQueueId, partOf(5))), commandID: '11' })
    await waitUntilPlaying(partOf(5))
    await waitForTimeline((t) => t.$.state === 'playing' && t.$.playQueueItemID === String(playQueueItemIdOf(playQueueId, partOf(5))))

    await hubRequest('/player/playback/seekTo', { type: 'music', offset: '90000', commandID: '12' })
    await e2e.waitUntilPlayedPast(90)
    await waitForTimeline((t) => t.$.state === 'playing' && Number(t.$.time) >= 90_000)

    await hubRequest('/player/playback/pause', { type: 'music', commandID: '13' })
    await waitForStatus('did not pause', (s) => s.mode === 'pause')
    const paused = await waitForTimeline((t) => t.$.state === 'paused')
    expect(paused.$.playQueueItemID).toBe(String(playQueueItemIdOf(playQueueId, partOf(5))))
    // the player may still report its final elapsed time after LMS switched to paused
    expect(Math.abs(Number(paused.$.time) - (await lmsStatus()).time * 1000)).toBeLessThanOrEqual(TIME_TOLERANCE_MS)

    await hubRequest('/player/playback/stop', { type: 'music', commandID: '14' })
    await waitForStatus('did not stop', (s) => s.mode === 'stop')
    await waitForTimeline((t) => t.$.state === 'stopped')
  })

  it('reports volume and repeat set via setParameters', async () => {
    await playAlbumFrom(1)

    await hubRequest('/player/playback/setParameters', { type: 'music', volume: '33', repeat: '2', commandID: '11' })
    await waitForStatus('did not apply the parameters', (s) => s.volume === 33 && s.repeat === 2, 5_000)

    const timeline = await pollMusicTimeline()
    expect(timeline.$).toMatchObject({ volume: '33', mute: '0', repeat: '2' })
  })

  it('reports a stopped player without play queue', async () => {
    const timeline = await pollMusicTimeline()
    expect(timeline.$.state).toBe('stopped')
    expect(timeline.$.playQueueID).toBeUndefined()
    expect(timeline.Track).toBeUndefined()
  })
})
