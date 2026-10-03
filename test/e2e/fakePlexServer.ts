import http from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Minimal Plex Media Server stand-in for e2e tests.
 *
 * It serves exactly what Squeeze Plex Hub and LMS need from a PMS:
 * - `POST /playQueues` creates a play queue for an album, honouring the `key` parameter as selected item (like PMS does)
 * - `GET /playQueues/:id` returns a previously created play queue
 * - `GET /library/parts/:id/file.wav` streams a silent WAV file (the audio LMS fetches for a track) at real-time rate.
 *   squeezelite's ALSA null output consumes audio as fast as it gets it, so throttling the stream is what keeps a track
 *   playing for its duration instead of finishing within moments.
 *
 * Every request is recorded so tests can assert which tracks LMS actually streamed.
 */

export interface FakeTrack {
  ratingKey: string
  title: string
  partId: string
}

export interface FakePlexServer {
  port: number
  album: { ratingKey: string; title: string; artist: string; tracks: FakeTrack[] }
  requests: string[]
  /** Part ids LMS (or the player) fetched audio for, in request order */
  streamedParts(): string[]
  /** Creates a play queue directly (as Plexamp does before sending `playMedia`) and returns its id */
  createPlayQueue(selectedRatingKey: string): number
  close(): Promise<void>
}

const SAMPLE_RATE = 8000
const TRACK_SECONDS = 120

function silentWav(seconds: number): Buffer {
  const dataSize = SAMPLE_RATE * seconds * 2 // 16-bit mono
  const header = Buffer.alloc(44)
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

function streamRealtime(res: http.ServerResponse, wav: Buffer) {
  // one second ahead so the player can start right away, afterwards as fast as it plays
  let offset = 44 + BYTES_PER_SECOND
  res.write(wav.subarray(0, offset))
  const timer = setInterval(() => {
    const end = Math.min(offset + (BYTES_PER_SECOND * CHUNK_INTERVAL_MS) / 1000, wav.length)
    res.write(wav.subarray(offset, end))
    offset = end
    if (offset >= wav.length) {
      clearInterval(timer)
      res.end()
    }
  }, CHUNK_INTERVAL_MS)
  res.on('close', () => clearInterval(timer))
}

const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export async function startFakePlexServer(): Promise<FakePlexServer> {
  const wav = silentWav(TRACK_SECONDS)
  const album = {
    ratingKey: '1000',
    title: 'E2E Album',
    artist: 'E2E Artist',
    tracks: Array.from({ length: 6 }, (_, i) => ({
      ratingKey: String(1001 + i),
      title: `Track ${i + 1}`,
      partId: String(2001 + i)
    }))
  }
  const playQueues = new Map<number, { selectedOffset: number }>()
  const requests: string[] = []
  let nextPlayQueueId = 1

  function createPlayQueue(selectedRatingKey: string) {
    const index = album.tracks.findIndex((t) => t.ratingKey === selectedRatingKey)
    const id = nextPlayQueueId++
    playQueues.set(id, { selectedOffset: Math.max(index, 0) })
    return id
  }

  function playQueueXml(id: number) {
    const { selectedOffset } = playQueues.get(id)!
    const itemId = (index: number) => id * 100 + index + 1
    const tracks = album.tracks
      .map(
        (t, i) =>
          `<Track playQueueItemID="${itemId(i)}" ratingKey="${t.ratingKey}" key="/library/metadata/${t.ratingKey}" type="track" ` +
          `title="${escapeXml(t.title)}" parentTitle="${escapeXml(album.title)}" grandparentTitle="${escapeXml(album.artist)}" ` +
          `parentRatingKey="${album.ratingKey}" index="${i + 1}" duration="${TRACK_SECONDS * 1000}">` +
          `<Media id="${t.partId}" duration="${TRACK_SECONDS * 1000}" audioChannels="1" audioCodec="pcm" container="wav">` +
          `<Part id="${t.partId}" key="/library/parts/${t.partId}/file.wav" duration="${TRACK_SECONDS * 1000}" container="wav" size="${wav.length}"/>` +
          `</Media></Track>`
      )
      .join('')
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<MediaContainer size="${album.tracks.length}" identifier="com.plexapp.plugins.library" playQueueID="${id}" ` +
      `playQueueSelectedItemID="${itemId(selectedOffset)}" playQueueSelectedItemOffset="${selectedOffset}" ` +
      `playQueueSelectedMetadataItemID="${album.tracks[selectedOffset]!.ratingKey}" playQueueShuffled="0" ` +
      `playQueueTotalCount="${album.tracks.length}" playQueueVersion="1">${tracks}</MediaContainer>`
    )
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push(`${req.method} ${url.pathname}${url.search}`)

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
      res.writeHead(200, { 'Content-Type': 'audio/x-wav', 'Content-Length': wav.length })
      if (req.method === 'HEAD') return res.end()
      return streamRealtime(res, wav)
    }

    res.writeHead(404)
    res.end()
  })

  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve))

  return {
    port: (server.address() as AddressInfo).port,
    album,
    requests,
    streamedParts: () => requests.map((r) => r.match(/^GET \/library\/parts\/(\d+)\//)?.[1]).filter((partId): partId is string => !!partId),
    createPlayQueue,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}
