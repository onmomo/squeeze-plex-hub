import { describe, expect, it } from 'vitest'
import { addPendingResets, getPendingResets } from '../../server/lib/hubConfig'
import { applyPendingResets, dissolveStereoPair, formStereoPair, reconcileStereoPair, supportsStereoPair } from '../../server/lib/stereoPair'
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

  const pref = async (playerId: string) => {
    const response: any = await e2e.lms.stub.requestAsync([playerId, ['playerpref', 'outputChannels', '?']])
    return response._p2
  }

  it('formStereoPair syncs the players and sets left and right output, dissolveStereoPair resets them', async () => {
    await formStereoPair(PLAYER_ID, PLAYER2_ID)

    const groups: any = await e2e.lms.stub.requestAsync(['', ['syncgroups', '?']])
    expect(groups.syncgroups_loop).toHaveLength(1)
    expect(groups.syncgroups_loop[0].sync_members.split(',').sort()).toEqual([PLAYER_ID, PLAYER2_ID].sort())
    expect(await pref(PLAYER_ID)).toBe('1')
    expect(await pref(PLAYER2_ID)).toBe('2')

    // Volumes are linked: a change on one player reaches the other
    await e2e.lms.stub.requestAsync([PLAYER_ID, ['mixer', 'volume', '33']])
    await waitFor(async () => Number(((await e2e.lms.stub.requestAsync([PLAYER2_ID, ['mixer', 'volume', '?']])) as any)?._volume) === 33, 15_000)
    await e2e.lms.stub.requestAsync([PLAYER2_ID, ['mixer', 'volume', '61']])
    await waitFor(async () => Number(((await e2e.lms.stub.requestAsync([PLAYER_ID, ['mixer', 'volume', '?']])) as any)?._volume) === 61, 15_000)

    // Playing on the left player (the pair's Plex target) reaches the right one
    await playOn(PLAYER_ID, 1)
    await waitUntilPlaying()
    await waitFor(async () => (await status2()).mode === 'play', 15_000)

    await dissolveStereoPair(PLAYER_ID, PLAYER2_ID)
    const dissolved: any = await e2e.lms.stub.requestAsync(['', ['syncgroups', '?']])
    expect(dissolved.syncgroups_loop ?? []).toHaveLength(0)
    expect(await pref(PLAYER_ID)).toBe('0')
    expect(await pref(PLAYER2_ID)).toBe('0')
    // Volumes are independent again
    await e2e.lms.stub.requestAsync([PLAYER_ID, ['mixer', 'volume', '20']])
    expect(Number(((await e2e.lms.stub.requestAsync([PLAYER2_ID, ['mixer', 'volume', '?']])) as any)?._volume)).toBe(61)
  })

  it('detects players that offer the output channel setting', async () => {
    expect(await supportsStereoPair(e2e.lms.stub, PLAYER_ID)).toBe(true)
    expect(await supportsStereoPair(e2e.lms.stub, PLAYER2_ID)).toBe(true)
  })

  it('works no matter which member is the sync master', async () => {
    // Left synced to right: the right player is the master of the group
    await e2e.lms.stub.requestAsync([PLAYER_ID, ['sync', PLAYER2_ID]])
    await playOn(PLAYER_ID, 2)
    await waitUntilPlaying()
    await waitFor(async () => (await status2()).mode === 'play', 15_000)
    expect((await hubRequest('/player/playback/pause', { commandID: '2' }, PLAYER_ID)).status).toBe(200)
    await waitFor(async () => (await lmsStatus()).mode === 'pause' && (await status2()).mode === 'pause', 15_000)
  })

  it('reconcile restores a pair that lost its sync and output channels', async () => {
    const pair = { name: 'E2E', leftId: PLAYER_ID, rightId: PLAYER2_ID }
    await formStereoPair(PLAYER_ID, PLAYER2_ID)
    expect(await reconcileStereoPair(pair)).toBe('ok')

    // Somebody ungroups the players in LMS and resets the output of the right one
    await e2e.lms.stub.requestAsync([PLAYER2_ID, ['sync', '-']])
    await e2e.lms.stub.requestAsync([PLAYER2_ID, ['playerpref', 'outputChannels', '0']])
    expect(await reconcileStereoPair(pair)).toBe('repaired')

    const groups: any = await e2e.lms.stub.requestAsync(['', ['syncgroups', '?']])
    expect(groups.syncgroups_loop[0].sync_members.split(',').sort()).toEqual([PLAYER_ID, PLAYER2_ID].sort())
    expect(await pref(PLAYER2_ID)).toBe('2')
    expect(await reconcileStereoPair(pair)).toBe('ok')
  })

  it('dissolving a pair while a member is offline leaves it unsynced with stereo output when it is back', async () => {
    await formStereoPair(PLAYER_ID, PLAYER2_ID)
    await e2e.lms.setSecondPlayerOnline(false)
    try {
      // The commands may be ignored for a player that is not connected, so it is left to the scanner to reset it later
      const failed = await dissolveStereoPair(PLAYER_ID, PLAYER2_ID)
      expect(failed).toEqual([PLAYER2_ID])
      await addPendingResets(failed)
    } finally {
      await e2e.lms.setSecondPlayerOnline(true)
    }
    await waitFor(async () => ((await e2e.lms.stub.requestAsync([PLAYER2_ID, ['connected', '?']])) as any)?._connected === 1, 60_000)

    const groups: any = await e2e.lms.stub.requestAsync(['', ['syncgroups', '?']])
    expect(groups.syncgroups_loop ?? []).toHaveLength(0)
    expect(await pref(PLAYER_ID)).toBe('0')
    expect(await pref(PLAYER2_ID)).toBe('0')
    await applyPendingResets()
    expect(await getPendingResets()).toEqual([])
  })

  it('reconcile reports a pair with a disconnected member as offline and has it intact again once the member is back', async () => {
    const pair = { name: 'E2E', leftId: PLAYER_ID, rightId: PLAYER2_ID }
    await formStereoPair(PLAYER_ID, PLAYER2_ID)
    await e2e.lms.setSecondPlayerOnline(false)
    try {
      await waitFor(async () => (await reconcileStereoPair(pair)) === 'offline', 30_000)
    } finally {
      await e2e.lms.setSecondPlayerOnline(true)
    }
    await waitFor(async () => ['ok', 'repaired'].includes(await reconcileStereoPair(pair)), 60_000)
    expect(await reconcileStereoPair(pair)).toBe('ok')
    expect(await pref(PLAYER2_ID)).toBe('2')
  })

  it('keeps the left player playing when the pair is dissolved, even if the right one is the sync master', async () => {
    // Left synced to right: the right player is the master of the group
    await e2e.lms.stub.requestAsync([PLAYER_ID, ['sync', PLAYER2_ID]])
    await playOn(PLAYER_ID, 1)
    await waitFor(async () => (await status2()).mode === 'play', 15_000)

    await dissolveStereoPair(PLAYER_ID, PLAYER2_ID)
    await waitFor(async () => (await lmsStatus()).mode === 'play' && (await status2()).mode === 'stop', 15_000)
  })
})
