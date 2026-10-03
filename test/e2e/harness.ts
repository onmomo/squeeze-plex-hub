import dns from 'node:dns'
import axios from 'axios'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { startFakePlexServer, type FakePlexServer } from './fakePlexServer'
import { PLEX_HOST, PLAYER_MAC, startLmsStack, waitFor, type LmsStack } from './lmsStack'
import { registerLms, startHub, type Hub } from './hub'

/**
 * Sets up the e2e stack (fake Plex server, LMS + squeezelite, hub) for the calling spec file and provides helpers to drive the
 * hub like a Plex client does and to observe the real LMS state.
 * Every test starts with an empty LMS playlist and default player settings.
 */

export const PLAYER_ID = PLAYER_MAC
export const DEFAULT_VOLUME = 50

export interface LmsStatus {
  mode: string
  time: number
  duration: number
  index: number
  tracks: number
  volume: number
  repeat: number
  shuffle: number
  /** LMS is still buffering the track (it ignores e.g. `pause` until then) */
  waitingToPlay: boolean
  /** Part id of the track at the current playlist index */
  partId?: string
}

const partIdOf = (url: string | undefined) => url?.match(/\/library\/parts\/(\d+)\//)?.[1]

export function useE2eStack() {
  let plex: FakePlexServer
  let lms: LmsStack
  let hub: Hub

  // The hub sends the Plex server address to LMS for streaming. Containers reach the fake Plex server on the test host
  // as PLEX_HOST, so the hub (running on the test host) resolves that name to the test host itself.
  const originalLookup = axios.defaults.lookup

  beforeAll(async () => {
    axios.defaults.lookup = (hostname: string, options: any, callback: any) =>
      dns.lookup(hostname === PLEX_HOST ? '127.0.0.1' : hostname, options, callback)
    plex = await startFakePlexServer()
    lms = await startLmsStack(plex.port)
    hub = await startHub()
    await registerLms(hub.storage, lms.host, lms.port)
  }, 300_000)

  afterAll(async () => {
    axios.defaults.lookup = originalLookup
    await hub?.close()
    await lms?.stop()
    await plex?.close()
  })

  beforeEach(async () => {
    await lmsCommand('playlist', 'clear')
    await lmsCommand('playlist', 'repeat', '0')
    await lmsCommand('playlist', 'shuffle', '0')
    await lmsCommand('mixer', 'volume', String(DEFAULT_VOLUME))
    await hub.storage.removeItem(`playerQueue/${PLAYER_ID}`)
    plex.requests.length = 0
  })

  const plexServerQuery = () => ({
    protocol: 'http',
    address: PLEX_HOST,
    port: String(plex.port),
    machineIdentifier: 'fake-pms',
    token: 'fake-token'
  })

  /** Sends a request to the hub like Plexamp does to the player it controls */
  async function hubRequest(path: string, query: Record<string, string> = {}) {
    return fetch(`${hub.url}${path}?${new URLSearchParams(query)}`, {
      headers: {
        'X-Plex-Target-Client-Identifier': PLAYER_ID,
        'X-Plex-Client-Identifier': 'e2e-plexamp',
        'X-Plex-Device-Name': 'E2E Plexamp'
      }
    })
  }

  async function lmsCommand(...command: string[]): Promise<any> {
    return lms.stub.requestAsync([PLAYER_ID, command])
  }

  async function lmsStatus(): Promise<LmsStatus> {
    const response = await lmsCommand('status', '-', '1', 'tags:u')
    return {
      mode: response.mode,
      time: Number(response.time) || 0,
      duration: Number(response.duration) || 0,
      index: Number(response.playlist_cur_index),
      tracks: Number(response.playlist_tracks) || 0,
      volume: Number(response['mixer volume']),
      repeat: Number(response['playlist repeat']),
      shuffle: Number(response['playlist shuffle']),
      waitingToPlay: !!response.waitingToPlay,
      partId: partIdOf(response.playlist_loop?.[0]?.url)
    }
  }

  /** Part ids of the tracks in the LMS playlist, in playlist order */
  async function lmsPlaylistParts(): Promise<(string | undefined)[]> {
    const response = await lmsCommand('status', '0', '999', 'tags:u')
    return (response.playlist_loop ?? []).map((entry: { url?: string }) => partIdOf(entry.url))
  }

  const isPlaying = (status: LmsStatus) => status.mode === 'play' && !status.waitingToPlay

  /** Waits until the LMS status matches and returns it, the error names the last status seen */
  async function waitForStatus(description: string, matches: (status: LmsStatus) => boolean, timeoutMs = 30_000): Promise<LmsStatus> {
    let status: LmsStatus | undefined
    try {
      await waitFor(async () => {
        status = await lmsStatus()
        return matches(status)
      }, timeoutMs)
    } catch (error) {
      throw new Error(`LMS player ${description} (last status: ${JSON.stringify(status)}, Plex requests: ${plex.requests.join(', ')})`, {
        cause: error
      })
    }
    return status!
  }

  /**
   * Waits until the player really plays the given track: LMS is done buffering it. Before, the reported time is not the one of
   * this track yet and LMS ignores e.g. `pause`.
   */
  async function waitUntilPlaying(partId?: string): Promise<LmsStatus> {
    return waitForStatus(
      `did not start playing${partId ? ` part ${partId}` : ''}`,
      (status) => isPlaying(status) && status.time > 0.5 && (!partId || status.partId === partId)
    )
  }

  /** Waits until the playback position advanced past `seconds`, i.e. the player keeps playing */
  async function waitUntilPlayedPast(seconds: number): Promise<LmsStatus> {
    return waitForStatus(`did not keep playing past ${seconds}s`, (status) => isPlaying(status) && status.time > seconds)
  }

  /**
   * Plays the album from the given track the way Plexamp does: it creates the play queue on PMS and sends `playMedia`.
   * Returns the play queue id once LMS plays the track.
   */
  async function playAlbumFrom(trackNumber: number): Promise<number> {
    const track = plex.album.tracks[trackNumber - 1]!
    const playQueueId = plex.createPlayQueue(track.ratingKey)
    const response = await hubRequest('/player/playback/playMedia', {
      ...plexServerQuery(),
      key: `/library/metadata/${track.ratingKey}`,
      containerKey: `/playQueues/${playQueueId}`,
      type: 'music',
      offset: '0',
      commandID: '1'
    })
    if (response.status !== 200) throw new Error(`playMedia failed with status ${response.status}`)
    await waitUntilPlaying(track.partId)
    return playQueueId
  }

  /** Part ids of the tracks in a fake Plex play queue, in play queue order */
  const playQueueParts = (playQueueId: number) => plex.playQueueItems(playQueueId).map((item) => item.track.partId)

  /** playQueueItemID of the item playing the given part */
  function playQueueItemIdOf(playQueueId: number, partId: string) {
    const item = plex.playQueueItems(playQueueId).find((i) => i.track.partId === partId)
    if (!item) throw new Error(`Part ${partId} is not in play queue ${playQueueId}`)
    return item.playQueueItemID
  }

  return {
    get plex() {
      return plex
    },
    get lms() {
      return lms
    },
    get hub() {
      return hub
    },
    plexServerQuery,
    hubRequest,
    lmsCommand,
    lmsStatus,
    lmsPlaylistParts,
    waitForStatus,
    waitUntilPlaying,
    waitUntilPlayedPast,
    playAlbumFrom,
    playQueueParts,
    playQueueItemIdOf,
    /** Part id of the album track with the given (1-based) number */
    partOf: (trackNumber: number) => plex.album.tracks[trackNumber - 1]!.partId
  }
}
