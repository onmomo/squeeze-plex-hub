import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Minimal Plex Media Server stand-in for e2e tests.
 *
 * It serves exactly what Squeeze Plex Hub and LMS need from a PMS:
 * - `POST /playQueues` creates a play queue for an album, honouring the `key` parameter as selected item (like PMS does)
 * - `GET /playQueues/:id` returns the current state of a play queue. Tests change play queues the way a Plex client does on PMS
 *   (`addToPlayQueue`, `moveInPlayQueue`, `removeFromPlayQueue`) before telling the hub to pick up the changes.
 * - `GET /library/parts/:id/file.wav` streams a silent WAV file (the audio LMS fetches for a track) at real-time rate.
 *   squeezelite's ALSA null output consumes audio as fast as it gets it, so throttling the stream is what keeps a track
 *   playing for its duration instead of finishing within moments. `Range` requests are honoured so LMS can seek.
 *
 * Every request is recorded so tests can assert which tracks LMS actually streamed.
 */

export interface FakeTrack {
  ratingKey: string
  title: string
  partId: string
}

export interface FakePlayQueueItem {
  playQueueItemID: number
  track: FakeTrack
}

export interface FakePlexServer {
  port: number
  /** All tracks of the library, `Track 1` to `Track 10`. Play queues start with the album, the others can be added later. */
  tracks: FakeTrack[]
  /** The container play queues are created for, it holds the first 6 tracks */
  album: { ratingKey: string; title: string; artist: string; tracks: FakeTrack[] }
  requests: string[]
  /** Part ids LMS (or the player) fetched audio for, in request order */
  streamedParts(): string[]
  /**
   * Creates a play queue for the album directly (as Plexamp does before sending `playMedia`) and returns its id.
   * Its items are numbered `<playQueueId * 100 + position>`, items added later continue that numbering.
   */
  createPlayQueue(selectedRatingKey: string): number
  /** Current items of a play queue, in play order */
  playQueueItems(playQueueId: number): FakePlayQueueItem[]
  /** Adds a track after the given item (or at the end), returns the new playQueueItemID */
  addToPlayQueue(playQueueId: number, ratingKey: string, afterPlayQueueItemID?: number): number
  /** Moves an item after another one, or to the top if `afterPlayQueueItemID` is omitted (like PMS' `PUT /playQueues/:id/items/:itemId/move`) */
  moveInPlayQueue(playQueueId: number, playQueueItemID: number, afterPlayQueueItemID?: number): void
  removeFromPlayQueue(playQueueId: number, playQueueItemID: number): void
  close(): Promise<void>
}

export const TRACK_SECONDS = 120
// LMS only leaves its BUFFERING state (before, it ignores `pause` and reports a stale time) once squeezelite's output buffer holds
// 1.76MB (5 seconds at 44.1kHz). It fills in real-time, so a high sample rate gets there quickly.
const SAMPLE_RATE = 192000
const WAV_HEADER_SIZE = 44

function silentWav(seconds: number): Buffer {
  const dataSize = SAMPLE_RATE * seconds * 2 // 16-bit mono
  const header = Buffer.alloc(WAV_HEADER_SIZE)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, Buffer.alloc(dataSize)])
}

const BYTES_PER_SECOND = SAMPLE_RATE * 2
const CHUNK_INTERVAL_MS = 100

function streamRealtime(res: http.ServerResponse, data: Buffer) {
  // one second ahead so the player can start right away, afterwards as fast as it plays
  let offset = Math.min(WAV_HEADER_SIZE + BYTES_PER_SECOND, data.length)
  res.write(data.subarray(0, offset))
  if (offset >= data.length) return res.end()
  const timer = setInterval(() => {
    const end = Math.min(offset + (BYTES_PER_SECOND * CHUNK_INTERVAL_MS) / 1000, data.length)
    res.write(data.subarray(offset, end))
    offset = end
    if (offset >= data.length) {
      clearInterval(timer)
      res.end()
    }
  }, CHUNK_INTERVAL_MS)
  res.on('close', () => clearInterval(timer))
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

interface PlayQueueState {
  items: FakePlayQueueItem[]
  selectedItemId: number
  version: number
  nextItemNumber: number
}

export async function startFakePlexServer(): Promise<FakePlexServer> {
  const wav = silentWav(TRACK_SECONDS)
  const tracks = Array.from({ length: 10 }, (_, i) => ({
    ratingKey: String(1001 + i),
    title: `Track ${i + 1}`,
    partId: String(2001 + i)
  }))
  const album = { ratingKey: '1000', title: 'E2E Album', artist: 'E2E Artist', tracks: tracks.slice(0, 6) }
  const playQueues = new Map<number, PlayQueueState>()
  const requests: string[] = []
  let nextPlayQueueId = 1

  function findTrack(ratingKey: string) {
    const track = tracks.find((t) => t.ratingKey === ratingKey)
    if (!track) throw new Error(`Unknown track '${ratingKey}'`)
    return track
  }

  function getPlayQueueState(id: number) {
    const playQueue = playQueues.get(id)
    if (!playQueue) throw new Error(`Unknown play queue '${id}'`)
    return playQueue
  }

  function indexOfItem(playQueue: PlayQueueState, playQueueItemID: number) {
    const index = playQueue.items.findIndex((item) => item.playQueueItemID === playQueueItemID)
    if (index === -1) throw new Error(`Unknown play queue item '${playQueueItemID}'`)
    return index
  }

  /** Inserts after the given item or, without one, at the given fallback position */
  function insertItem(playQueue: PlayQueueState, item: FakePlayQueueItem, afterPlayQueueItemID: number | undefined, fallbackIndex: number) {
    const index = afterPlayQueueItemID === undefined ? fallbackIndex : indexOfItem(playQueue, afterPlayQueueItemID) + 1
    playQueue.items.splice(index, 0, item)
    playQueue.version++
  }

  function createPlayQueue(selectedRatingKey: string) {
    const id = nextPlayQueueId++
    const items = album.tracks.map((track, i) => ({ playQueueItemID: id * 100 + i + 1, track }))
    const selected = items.find((item) => item.track.ratingKey === selectedRatingKey) ?? items[0]!
    playQueues.set(id, { items, selectedItemId: selected.playQueueItemID, version: 1, nextItemNumber: items.length + 1 })
    return id
  }

  function addToPlayQueue(playQueueId: number, ratingKey: string, afterPlayQueueItemID?: number) {
    const playQueue = getPlayQueueState(playQueueId)
    const item = { playQueueItemID: playQueueId * 100 + playQueue.nextItemNumber++, track: findTrack(ratingKey) }
    insertItem(playQueue, item, afterPlayQueueItemID, playQueue.items.length)
    return item.playQueueItemID
  }

  function moveInPlayQueue(playQueueId: number, playQueueItemID: number, afterPlayQueueItemID?: number) {
    const playQueue = getPlayQueueState(playQueueId)
    const [item] = playQueue.items.splice(indexOfItem(playQueue, playQueueItemID), 1)
    insertItem(playQueue, item!, afterPlayQueueItemID, 0)
  }

  function removeFromPlayQueue(playQueueId: number, playQueueItemID: number) {
    const playQueue = getPlayQueueState(playQueueId)
    playQueue.items.splice(indexOfItem(playQueue, playQueueItemID), 1)
    playQueue.version++
  }

  function playQueueXml(id: number) {
    const { items, selectedItemId, version } = getPlayQueueState(id)
    const selectedOffset = Math.max(
      items.findIndex((item) => item.playQueueItemID === selectedItemId),
      0
    )
    const tracks = items
      .map(
        ({ playQueueItemID, track: t }, i) =>
          `<Track playQueueItemID="${playQueueItemID}" ratingKey="${t.ratingKey}" key="/library/metadata/${t.ratingKey}" type="track" ` +
          `title="${escapeXml(t.title)}" parentTitle="${escapeXml(album.title)}" grandparentTitle="${escapeXml(album.artist)}" ` +
          `parentRatingKey="${album.ratingKey}" index="${i + 1}" duration="${TRACK_SECONDS * 1000}">` +
          `<Media id="${t.partId}" duration="${TRACK_SECONDS * 1000}" audioChannels="1" audioCodec="pcm" container="wav">` +
          `<Part id="${t.partId}" key="/library/parts/${t.partId}/file.wav" duration="${TRACK_SECONDS * 1000}" container="wav" size="${wav.length}"/>` +
          `</Media></Track>`
      )
      .join('')
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<MediaContainer size="${items.length}" identifier="com.plexapp.plugins.library" playQueueID="${id}" ` +
      `playQueueSelectedItemID="${items[selectedOffset]?.playQueueItemID}" playQueueSelectedItemOffset="${selectedOffset}" ` +
      `playQueueSelectedMetadataItemID="${items[selectedOffset]?.track.ratingKey}" playQueueShuffled="0" ` +
      `playQueueTotalCount="${items.length}" playQueueVersion="${version}">${tracks}</MediaContainer>`
    )
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const range = req.headers.range
    requests.push(`${req.method} ${url.pathname}${url.search}${range ? ` (${range})` : ''}`)

    if (req.method === 'POST' && url.pathname === '/playQueues') {
      // PMS uses `key` to select the item to start with inside the container given by `uri`, defaulting to the first one
      const key = url.searchParams.get('key') ?? ''
      const id = createPlayQueue(key.split('/').pop() ?? '')
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      return res.end(playQueueXml(id))
    }

    const playQueueMatch = url.pathname.match(/^\/playQueues\/(\d+)$/)
    if (req.method === 'GET' && playQueueMatch && playQueues.has(Number(playQueueMatch[1]))) {
      res.writeHead(200, { 'Content-Type': 'application/xml' })
      return res.end(playQueueXml(Number(playQueueMatch[1])))
    }

    if (/^\/library\/parts\/\d+\/file\.wav$/.test(url.pathname)) {
      const rangeMatch = range?.match(/^bytes=(\d+)-(\d*)$/)
      const start = rangeMatch ? Number(rangeMatch[1]) : 0
      const end = rangeMatch?.[2] ? Number(rangeMatch[2]) : wav.length - 1
      if (start >= wav.length || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${wav.length}` })
        return res.end()
      }
      const body = wav.subarray(start, end + 1)
      res.writeHead(rangeMatch ? 206 : 200, {
        'Content-Type': 'audio/x-wav',
        'Content-Length': body.length,
        'Accept-Ranges': 'bytes',
        ...(rangeMatch ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {})
      })
      if (req.method === 'HEAD') return res.end()
      return streamRealtime(res, body)
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))

  return {
    port: (server.address() as AddressInfo).port,
    tracks,
    album,
    requests,
    streamedParts: () => requests.map((r) => r.match(/^GET \/library\/parts\/(\d+)\//)?.[1]).filter((partId): partId is string => !!partId),
    createPlayQueue,
    playQueueItems: (playQueueId) => [...getPlayQueueState(playQueueId).items],
    addToPlayQueue,
    moveInPlayQueue,
    removeFromPlayQueue,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}
