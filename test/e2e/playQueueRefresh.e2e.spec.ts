import { describe, expect, it } from 'vitest'
import { useE2eStack } from './harness'

/**
 * Play queue changes on PMS (Plexamp adding, moving or removing tracks, radio play queues growing while playing) reaching LMS:
 * explicitly via `refreshPlayQueue` and implicitly via the playQueueRefresher fallback of the skip commands.
 */
describe('e2e: hub -> LMS play queue refresh', () => {
  const e2e = useE2eStack()
  const { hubRequest, lmsStatus, lmsPlaylistParts, partOf, playAlbumFrom, playQueueParts, playQueueItemIdOf, waitUntilPlaying } = e2e

  const refreshPlayQueue = (playQueueId: number) =>
    hubRequest('/player/playback/refreshPlayQueue', { playQueueID: String(playQueueId), commandID: '5' })

  /** The track keeps playing (it is not restarted or replaced) */
  async function expectStillPlaying(partId: string, playedSeconds: number) {
    const status = await e2e.waitUntilPlayedPast(playedSeconds)
    expect(status.partId).toBe(partId)
  }

  describe('refreshPlayQueue', () => {
    it('appends tracks added to the play queue and keeps playing the current track', async () => {
      const playQueueId = await playAlbumFrom(1)
      const [extra1, extra2] = e2e.plex.extraTracks
      e2e.plex.addToPlayQueue(playQueueId, extra1!.ratingKey)
      e2e.plex.addToPlayQueue(playQueueId, extra2!.ratingKey)
      const before = await lmsStatus()

      const response = await refreshPlayQueue(playQueueId)
      expect(response.status).toBe(200)

      expect(await lmsPlaylistParts()).toEqual(playQueueParts(playQueueId))
      expect(await lmsPlaylistParts()).toEqual([
        partOf(1),
        partOf(2),
        partOf(3),
        partOf(4),
        partOf(5),
        partOf(6),
        extra1!.partId,
        extra2!.partId
      ])
      expect((await lmsStatus()).index).toBe(0)
      await expectStillPlaying(partOf(1), before.time)
    })

    it('applies moved and removed upcoming tracks', async () => {
      const playQueueId = await playAlbumFrom(2)
      // play track 6 next and drop track 4
      e2e.plex.moveInPlayQueue(playQueueId, playQueueItemIdOf(playQueueId, partOf(6)), playQueueItemIdOf(playQueueId, partOf(2)))
      e2e.plex.removeFromPlayQueue(playQueueId, playQueueItemIdOf(playQueueId, partOf(4)))
      const before = await lmsStatus()

      const response = await refreshPlayQueue(playQueueId)
      expect(response.status).toBe(200)

      expect(await lmsPlaylistParts()).toEqual([partOf(1), partOf(2), partOf(6), partOf(3), partOf(5)])
      expect((await lmsStatus()).index).toBe(1)
      await expectStillPlaying(partOf(2), before.time)
    })

    it('removes already played tracks that were removed from the play queue', async () => {
      const playQueueId = await playAlbumFrom(3)
      e2e.plex.removeFromPlayQueue(playQueueId, playQueueItemIdOf(playQueueId, partOf(1)))
      const before = await lmsStatus()

      const response = await refreshPlayQueue(playQueueId)
      expect(response.status).toBe(200)

      expect(await lmsPlaylistParts()).toEqual(playQueueParts(playQueueId))
      expect((await lmsStatus()).index).toBe(1)
      await expectStillPlaying(partOf(3), before.time)
    })

    it('plays the refreshed tracks once the current track was skipped', async () => {
      const playQueueId = await playAlbumFrom(1)
      const extra = e2e.plex.extraTracks[0]!
      e2e.plex.addToPlayQueue(playQueueId, extra.ratingKey, playQueueItemIdOf(playQueueId, partOf(1)))
      expect((await refreshPlayQueue(playQueueId)).status).toBe(200)

      expect((await hubRequest('/player/playback/skipNext', { commandID: '6' })).status).toBe(200)

      const status = await waitUntilPlaying(extra.partId)
      expect(status).toMatchObject({ index: 1, tracks: 7 })
    })

    it('rejects a refresh without a loaded play queue', async () => {
      const response = await refreshPlayQueue(1)
      expect(response.status).toBe(404)
      expect(await lmsPlaylistParts()).toEqual([])
    })
  })

  describe('playQueueRefresher fallback', () => {
    it('skipTo loads an item that was added to the play queue after it was loaded', async () => {
      const playQueueId = await playAlbumFrom(1)
      const extra = e2e.plex.extraTracks[0]!
      const playQueueItemID = e2e.plex.addToPlayQueue(playQueueId, extra.ratingKey)

      const response = await hubRequest('/player/playback/skipTo', { playQueueItemID: String(playQueueItemID), commandID: '6' })
      expect(response.status).toBe(200)

      const status = await waitUntilPlaying(extra.partId)
      expect(status).toMatchObject({ index: 6, tracks: 7 })
      expect(await lmsPlaylistParts()).toEqual(playQueueParts(playQueueId))
    })

    it('skipTo fails for an item that is not in the refreshed play queue either', async () => {
      const playQueueId = await playAlbumFrom(2)

      const response = await hubRequest('/player/playback/skipTo', { playQueueItemID: String(playQueueId * 100 + 99), commandID: '6' })
      expect(response.status).toBe(404)

      // the refresher reloaded the playlist before the item turned out to be unknown
      expect(await lmsPlaylistParts()).toEqual(playQueueParts(playQueueId))
    })

    it('skipNext on the last track plays tracks that were added to the play queue meanwhile', async () => {
      const playQueueId = await playAlbumFrom(6)
      const [extra1, extra2] = e2e.plex.extraTracks
      e2e.plex.addToPlayQueue(playQueueId, extra1!.ratingKey)
      e2e.plex.addToPlayQueue(playQueueId, extra2!.ratingKey)

      const response = await hubRequest('/player/playback/skipNext', { commandID: '6' })
      expect(response.status).toBe(200)

      const status = await waitUntilPlaying(extra1!.partId)
      expect(status).toMatchObject({ index: 6, tracks: 8 })
      expect(await lmsPlaylistParts()).toEqual(playQueueParts(playQueueId))
    })

    it('skipPrevious on the first track plays a track that was moved before it meanwhile', async () => {
      const playQueueId = await playAlbumFrom(1)
      const extra = e2e.plex.extraTracks[0]!
      e2e.plex.moveInPlayQueue(playQueueId, e2e.plex.addToPlayQueue(playQueueId, extra.ratingKey))

      const response = await hubRequest('/player/playback/skipPrevious', { commandID: '6' })
      expect(response.status).toBe(200)

      const status = await waitUntilPlaying(extra.partId)
      expect(status).toMatchObject({ index: 0, tracks: 7 })
      expect(await lmsPlaylistParts()).toEqual(playQueueParts(playQueueId))
    })
  })
})
