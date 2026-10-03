import { describe, expect, it } from 'vitest'
import { PLAYER2_ID, PLAYER_ID, useE2eStack } from './harness'
import { waitFor } from './lmsStack'

/**
 * Two players synced in LMS (a "stereo pair", e.g. two Squeezebox Radios with output channel Left / Right).
 * The hub has no notion of sync groups, so this verifies that driving either member works for the whole group.
 */
describe('e2e: hub -> LMS synced stereo pair', () => {
  const e2e = useE2eStack({ secondPlayer: true })
  const { hubRequest, lmsStatus, partOf, waitUntilPlaying, waitUntilPlayedPast } = e2e

  const status2 = async () => {
    const response: any = await e2e.lms.stub.requestAsync([PLAYER2_ID, ['status', '-', '1', 'tags:u']])
    return { mode: response.mode as string, time: Number(response.time) || 0, tracks: Number(response.playlist_tracks) || 0 }
  }

  async function syncPair() {
    await e2e.lms.stub.requestAsync([PLAYER2_ID, ['sync', PLAYER_ID]])
    const groups: any = await e2e.lms.stub.requestAsync(['', ['syncgroups', '?']])
    expect(groups.syncgroups_loop).toHaveLength(1)
    expect(groups.syncgroups_loop[0].sync_members).toContain(PLAYER2_ID)
  }

  async function playOn(targetPlayerId: string, trackNumber: number) {
    const track = e2e.track(trackNumber)
    const playQueueId = e2e.plex.createPlayQueue(track.ratingKey)
    const response = await hubRequest(
      '/player/playback/playMedia',
      {
        ...e2e.plexServerQuery(),
        key: `/library/metadata/${track.ratingKey}`,
        containerKey: `/playQueues/${playQueueId}`,
        type: 'music',
        offset: '0',
        commandID: '1'
      },
      targetPlayerId
    )
    expect(response.status).toBe(200)
  }

  it.each([
    ['first member', PLAYER_ID],
    ['second member', PLAYER2_ID]
  ])('playMedia on the %s plays on both players', async (_name, target) => {
    await syncPair()
    await playOn(target, 2)
    await waitUntilPlaying()
    await waitUntilPlayedPast(1)

    await waitFor(async () => (await status2()).mode === 'play', 15_000)
    expect((await status2()).tracks).toBe(6)
    expect((await lmsStatus()).tracks).toBe(6)
  })

  it('pause and skipNext on one member apply to both', async () => {
    await syncPair()
    await playOn(PLAYER_ID, 1)
    await waitUntilPlaying()

    expect((await hubRequest('/player/playback/pause', { commandID: '2' }, PLAYER2_ID)).status).toBe(200)
    await waitFor(async () => (await lmsStatus()).mode === 'pause' && (await status2()).mode === 'pause', 15_000)

    expect((await hubRequest('/player/playback/play', { commandID: '3' }, PLAYER_ID)).status).toBe(200)
    await waitUntilPlaying()
    expect((await hubRequest('/player/playback/skipNext', { commandID: '4' }, PLAYER2_ID)).status).toBe(200)
    await waitUntilPlaying(partOf(2))
    await waitFor(async () => (await status2()).mode === 'play', 15_000)
  })

  it('output channel pref can be set via LMS CLI', async () => {
    await e2e.lms.stub.requestAsync([PLAYER_ID, ['playerpref', 'outputChannels', '1']])
    const left: any = await e2e.lms.stub.requestAsync([PLAYER_ID, ['playerpref', 'outputChannels', '?']])
    expect(left._p2).toBe('1')
    await e2e.lms.stub.requestAsync([PLAYER_ID, ['playerpref', 'outputChannels', '0']])
  })
})
