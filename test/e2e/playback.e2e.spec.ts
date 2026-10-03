import dns from 'node:dns'
import axios from 'axios'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import createPlayQueue from '../../server/routes/player/playback/createPlayQueue.get'
import playMedia from '../../server/routes/player/playback/playMedia.get'
import skipTo from '../../server/routes/player/playback/skipTo.get'
import { startFakePlexServer, type FakePlexServer } from './fakePlexServer'
import { PLEX_HOST, PLAYER_MAC, startLmsStack, waitFor, type LmsStack } from './lmsStack'
import { registerLms, startHub, type Hub } from './hub'

/**
 * End-to-end tests from Squeeze Plex Hub to a real LMS with a real (headless) squeezelite player.
 * The Plex side is faked, the requests a Plex client would send to the hub are issued directly.
 */

const PLAYER_ID = PLAYER_MAC

interface LmsStatus {
  mode: string
  time: number
  index: number
  tracks: number
}

describe('e2e: hub -> LMS playback', () => {
  let plex: FakePlexServer
  let lms: LmsStack
  let hub: Hub

  // The hub sends the Plex server address to LMS for streaming. Containers reach the fake Plex server on the test host
  // as PLEX_HOST, so the hub (running on the test host) resolves that name to the test host itself.
  const originalLookup = axios.defaults.lookup
  axios.defaults.lookup = (hostname: string, options: any, callback: any) =>
    dns.lookup(hostname === PLEX_HOST ? '127.0.0.1' : hostname, options, callback)

  beforeAll(async () => {
    plex = await startFakePlexServer()
    lms = await startLmsStack(plex.port)
    hub = await startHub({
      '/player/playback/createPlayQueue': createPlayQueue,
      '/player/playback/playMedia': playMedia,
      '/player/playback/skipTo': skipTo
    })
    await registerLms(hub.storage, lms.host, lms.port)
  }, 300_000)

  afterAll(async () => {
    axios.defaults.lookup = originalLookup
    await hub?.close()
    await lms?.stop()
    await plex?.close()
  })

  beforeEach(async () => {
    await lms.stub.requestAsync([PLAYER_ID, ['playlist', 'clear']])
    plex.requests.length = 0
  })

  const plexServerQuery = () => ({
    protocol: 'http',
    address: PLEX_HOST,
    port: String(plex.port),
    machineIdentifier: 'fake-pms',
    token: 'fake-token'
  })

  async function hubRequest(path: string, query: Record<string, string>) {
    return fetch(`${hub.url}${path}?${new URLSearchParams(query)}`, {
      headers: {
        'X-Plex-Target-Client-Identifier': PLAYER_ID,
        'X-Plex-Client-Identifier': 'e2e-plexamp',
        'X-Plex-Device-Name': 'E2E Plexamp'
      }
    })
  }

  async function lmsStatus(): Promise<LmsStatus> {
    const response: any = await lms.stub.requestAsync([PLAYER_ID, ['status', '-', '1']])
    return {
      mode: response.mode,
      time: Number(response.time) || 0,
      index: Number(response.playlist_cur_index),
      tracks: Number(response.playlist_tracks) || 0
    }
  }

  /** Waits until the player really plays (audio is being rendered) and returns the status */
  async function waitUntilPlaying(): Promise<LmsStatus> {
    let status: LmsStatus | undefined
    try {
      await waitFor(async () => {
        status = await lmsStatus()
        return status.mode === 'play' && status.time > 0.5
      }, 30_000)
    } catch (error) {
      throw new Error(`Player did not start playing (last status: ${JSON.stringify(status)}, Plex requests: ${plex.requests.join(', ')})`, {
        cause: error
      })
    }
    return status!
  }

  const partOf = (trackNumber: number) => plex.album.tracks[trackNumber - 1]!.partId

  it('createPlayQueue starts an album at the selected track (#106)', async () => {
    const track5 = plex.album.tracks[4]!
    const response = await hubRequest('/player/playback/createPlayQueue', {
      ...plexServerQuery(),
      uri: `server://fake-pms/com.plexapp.plugins.library/library/metadata/${plex.album.ratingKey}`,
      key: `/library/metadata/${track5.ratingKey}`,
      type: 'audio',
      commandID: '1'
    })
    expect(response.status).toBe(200)

    const status = await waitUntilPlaying()
    expect(status.tracks).toBe(6)
    expect(status.index).toBe(4)
    expect(plex.streamedParts()).toContain(partOf(5))
    expect(plex.streamedParts()).not.toContain(partOf(1))
  })

  it('playMedia starts an existing play queue at the selected track', async () => {
    const track4 = plex.album.tracks[3]!
    const playQueueId = plex.createPlayQueue(track4.ratingKey)
    const response = await hubRequest('/player/playback/playMedia', {
      ...plexServerQuery(),
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
    expect(plex.streamedParts()).not.toContain(partOf(1))
  })

  it('skipTo jumps to the requested play queue item', async () => {
    const playQueueId = plex.createPlayQueue(plex.album.tracks[0]!.ratingKey)
    await hubRequest('/player/playback/playMedia', {
      ...plexServerQuery(),
      key: `/library/metadata/${plex.album.tracks[0]!.ratingKey}`,
      containerKey: `/playQueues/${playQueueId}`,
      type: 'music',
      commandID: '3'
    })
    await waitUntilPlaying()

    // the fake server numbers play queue items as <playQueueId * 100 + position>
    const response = await hubRequest('/player/playback/skipTo', { playQueueItemID: String(playQueueId * 100 + 3), commandID: '4' })
    expect(response.status).toBe(200)

    await waitFor(async () => (await lmsStatus()).index === 2, 10_000)
    const status = await waitUntilPlaying()
    expect(status.index).toBe(2)
  })
})
