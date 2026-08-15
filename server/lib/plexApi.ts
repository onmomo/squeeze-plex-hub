import axios from 'axios'
import { plexOptions } from './squeezePlexHub'
import useLogger from '../composables/useLogger'
import type { PlayQueue, Track } from './plexPlayerTimeline'
import { parseStringPromise } from 'xml2js'
import type { PlexServerResponse } from '../tasks/gdmDiscovery'

const logger = useLogger('plexApi')

export interface PlexServer {
  server: PlexServerResponse
  token: string
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
  })

export function getPlexApi(plexServer: PlexServer, path: string): string {
  logger.debug(
    `Generating Plex API URL for path '${path}' on server '${plexServer.server.name}' (${plexServer.server.protocol}://${plexServer.server.localAddress}:${plexServer.server.port}) ..`
  )
  return `${plexServer.server.protocol}://${plexServer.server.localAddress}:${plexServer.server.port}${path}`
}

/**
 * Generates the Plex API URL for a specific track.
 * This URL can be used to stream the track directly from the Plex server until the token expires.
 *
 * @param plexServer Plex server to generate the API URL for
 * @param track Track to generate the API URL for
 * @returns Plex API URL for the given track to stream it
 */
export function getPlexApiTrack(plexServer: PlexServer, track: Track): string {
  return `${plexServer.server.protocol}://${plexServer.server.localAddress}:${plexServer.server.port}${track?.Media[0]?.Part[0]?.$.key}?X-Plex-Token=${plexServer.token}&squeezePlexHub_rk=${track?.$.ratingKey}`
}

/**
 * Returns metadata string that LMS seems to be able to parse for file stream.
 * @param track track to generate LMS metadata
 * @returns LMS for LMS
 *
 * @see https://github.com/LMS-Community/slimserver/blob/2c8f7a6f6657e695d7e799c04b232d9d05c17538/Slim/Player/Protocols/HTTP.pm#L1076
 */
export function metadata(meta: Track): string {
  return `${meta.$.grandparentTitle} - ${meta.$.title} (${meta.$.parentTitle})`
}

/**
 * Returns Plex playQueue for the given container key.
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
