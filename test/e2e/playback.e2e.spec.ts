import { describe, expect, it } from 'vitest'
import { DEFAULT_VOLUME, useE2eStack } from './harness'

/**
 * End-to-end tests from Squeeze Plex Hub to a real LMS with a real (headless) squeezelite player.
 * The Plex side is faked, the requests a Plex client would send to the hub are issued directly.
 */
describe('e2e: hub -> LMS playback', () => {
  const e2e = useE2eStack()
  const { hubRequest, lmsStatus, partOf, waitForStatus, waitUntilPlaying, waitUntilPlayedPast, playAlbumFrom } = e2e

  it('createPlayQueue starts an album at the selected track (#106)', async () => {
    const track5 = e2e.plex.album.tracks[4]!
    const response = await hubRequest('/player/playback/createPlayQueue', {
      ...e2e.plexServerQuery(),
      uri: `server://fake-pms/com.plexapp.plugins.library/library/metadata/${e2e.plex.album.ratingKey}`,
      key: `/library/metadata/${track5.ratingKey}`,
      type: 'audio',
      commandID: '1'
    })
    expect(response.status).toBe(200)

    const status = await waitUntilPlaying()
    expect(status.tracks).toBe(6)
    expect(status.index).toBe(4)
    expect(e2e.plex.streamedParts()).toContain(partOf(5))
    expect(e2e.plex.streamedParts()).not.toContain(partOf(1))
  })

  it('playMedia starts an existing play queue at the selected track', async () => {
    const track4 = e2e.plex.album.tracks[3]!
    const playQueueId = e2e.plex.createPlayQueue(track4.ratingKey)
    const response = await hubRequest('/player/playback/playMedia', {
      ...e2e.plexServerQuery(),
      key: `/library/metadata/${track4.ratingKey}`,
      containerKey: `/playQueues/${playQueueId}`,
      type: 'music',
      offset: '0',
      commandID: '2'
    })
    expect(response.status).toBe(200)

    const status = await waitUntilPlaying()
    expect(status.tracks).toBe(6)
    expect(status.index).toBe(3)
    expect(e2e.plex.streamedParts()).not.toContain(partOf(1))
  })

  it('skipTo jumps to the requested play queue item', async () => {
    const playQueueId = await playAlbumFrom(1)

    const response = await hubRequest('/player/playback/skipTo', {
      playQueueItemID: String(e2e.playQueueItemIdOf(playQueueId, partOf(3))),
      commandID: '4'
    })
    expect(response.status).toBe(200)

    const status = await waitUntilPlaying(partOf(3))
    expect(status.index).toBe(2)
  })

  it('skipNext plays the next track of the playlist', async () => {
    await playAlbumFrom(2)

    const response = await hubRequest('/player/playback/skipNext', { commandID: '2' })
    expect(response.status).toBe(200)

    const status = await waitUntilPlaying(partOf(3))
    expect(status).toMatchObject({ index: 2, tracks: 6 })
  })

  it('skipPrevious plays the previous track of the playlist', async () => {
    await playAlbumFrom(3)

    const response = await hubRequest('/player/playback/skipPrevious', { commandID: '2' })
    expect(response.status).toBe(200)

    const status = await waitUntilPlaying(partOf(2))
    expect(status).toMatchObject({ index: 1, tracks: 6 })
  })

  it('seekTo moves the playback position of the current track', async () => {
    await playAlbumFrom(1)

    const response = await hubRequest('/player/playback/seekTo', { type: 'music', offset: '60000', commandID: '2' })
    expect(response.status).toBe(200)

    const status = await waitForStatus('did not seek to 60s', (s) => s.mode === 'play' && s.time >= 60, 15_000)
    expect(status.index).toBe(0)
    expect(status.time).toBeLessThan(75)
    // the position keeps advancing from the new offset
    await waitUntilPlayedPast(status.time + 1)
  })

  it('pause, play and stop control the player', async () => {
    await playAlbumFrom(2)

    expect((await hubRequest('/player/playback/pause', { type: 'music', commandID: '2' })).status).toBe(200)
    const paused = await waitForStatus('did not pause', (s) => s.mode === 'pause')

    expect((await hubRequest('/player/playback/play', { type: 'music', commandID: '3' })).status).toBe(200)
    const resumed = await waitUntilPlayedPast(paused.time + 0.5)
    expect(resumed).toMatchObject({ index: 1, partId: partOf(2) })

    expect((await hubRequest('/player/playback/stop', { type: 'music', commandID: '4' })).status).toBe(200)
    const stopped = await waitForStatus('did not stop', (s) => s.mode === 'stop')
    expect(stopped).toMatchObject({ index: 1, tracks: 6 })
  })

  it('setParameters changes the volume', async () => {
    await playAlbumFrom(1)
    expect((await lmsStatus()).volume).toBe(DEFAULT_VOLUME)

    const response = await hubRequest('/player/playback/setParameters', { type: 'music', volume: '27', commandID: '2' })
    expect(response.status).toBe(200)

    await waitForStatus('did not change volume', (s) => s.volume === 27, 5_000)
  })

  it.each([
    { repeat: 1, description: 'current track' },
    { repeat: 2, description: 'entire playlist' },
    { repeat: 0, description: 'off' }
  ])('setParameters sets repeat to $description ($repeat)', async ({ repeat }) => {
    await e2e.lmsCommand('playlist', 'repeat', repeat === 0 ? '2' : '0')
    await playAlbumFrom(1)

    const response = await hubRequest('/player/playback/setParameters', { type: 'music', repeat: String(repeat), commandID: '2' })
    expect(response.status).toBe(200)

    await waitForStatus(`did not set repeat ${repeat}`, (s) => s.repeat === repeat, 5_000)
  })

  // setParameters ignores the shuffle parameter so far (see TODO in setParameters.get.ts)
  it.todo('setParameters sets shuffle')
})
