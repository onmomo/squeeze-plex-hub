import axios from 'axios'
import { plexOptions } from './squeezePlexHub'
import useLogger from '../composables/useLogger'
import type { PlayQueue, Track } from './plexPlayerTimeline'
import { parseStringPromise } from 'xml2js'

const logger = useLogger('plexApi')

export interface PlexServer {
  protocol: string
  host: string
  port: string
  token: string | undefined
}

export const responseHeaders = (playerId: string, playerName: string, contentType?: string) =>
  new Headers({
    'Content-Type': contentType ? contentType : 'text/plain',
    'X-Plex-Client-Identifier': playerId,
    'X-Plex-Device-Name': playerName,
    'X-Plex-Product': plexOptions.product,
    'X-Plex-Version': plexOptions.version,
    'X-Plex-Protocol': plexOptions.protocol,
    'X-Plex-Protocol-Version': plexOptions.protocolVersion,
    'X-Plex-Device': plexOptions.device,
    'X-Plex-Model': plexOptions.model,
    'X-Plex-Platform': plexOptions.platform,
    'X-Plex-Platform-Version': plexOptions.platformVersion,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT, HEAD',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Access-Control-Max-Age': '1209600'
    //'Access-Control-Expose-Headers': 'X-Plex-Client-Identifier'
  })

// TODO we should never use the public plex address since we need to send the plex token as url query parameter for LMS to stream from it. I can't think of a valid where using the public plex address would be useful in our LMS use case
export function getPlexApiUrl(protocol: string, address: string, port: string, path: string): string {
  return `${protocol}://${address}:${port}${path}`
}

export function getPlexApi(plexServer: PlexServer, path: string): string {
  return `${plexServer.protocol}://${plexServer.host}:${plexServer.port}${path}`
}

export function getPlexApiTrack(plexServer: PlexServer, meta: Track): string {
  return `${plexServer.protocol}://${plexServer.host}:${plexServer.port}${meta.Media[0].Part[0].$.key}?X-Plex-Token=${plexServer.token}`
  //TODO return `${protocol}://${address}:${port}${track.file}?X-Plex-Token=${token}&artist=mytitle&title=blubber&cover=https%3A%2F%2Fwww.rockarchive.com%2Fmedia%2F1890%2Fdavid-bowie-db001duffy.jpg%3Fcrop%3D0.19186424300418511%2C0.18786141133986681%2C0.20427102269629802%2C0.20827385436061632%26cropmode%3Dpercentage%26width%3D800%26height%3D800%26rnd%3D132951122240000000%26overlay%3Dwatermark.png%26overlay.size%3D230%2C20%26overlay.position%3D0%2C780`
}

/**
 * Returns metadata string that LMS seems to be able to parse.
 * @param track track to generate LMS metadata
 * @returns LMS for LMS
 *
 * @see https://github.com/LMS-Community/slimserver/blob/2c8f7a6f6657e695d7e799c04b232d9d05c17538/Slim/Player/Protocols/HTTP.pm#L1076
 */
export function metadata(meta: Track): string {
  return `${meta.$.grandparentTitle} - ${meta.$.title} (${meta.$.parentTitle})`
}

/**
 *
 * @param plexServer
 * @param containerKey e.g. /playQueues/1234
 * @returns parsed PlayQueue object
 */
export async function getPlayQueue(plexServer: PlexServer, containerKey: string): Promise<PlayQueue> {
  try {
    const url = getPlexApi(plexServer, containerKey)
    const response = await axios.get<string>(url, {
      headers: {
        'X-Plex-Token': plexServer.token,
        Accept: 'application/xml'
      }
    })
    if (!response.data) {
      throw new Error(`No playQueue responded from Plex server for key ${containerKey}`)
    }
    return await parseStringPromise(response.data)
  } catch (err) {
    logger.warn(`Failed to fetch playQueue '${containerKey}' from Plex server`, err)
    throw new Error(`Failed to fetch playQueue '${containerKey}' from Plex server`)
  }
}
