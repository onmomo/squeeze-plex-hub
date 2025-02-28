import useLogger from '~/server/composables/useLogger'
import { getRequestHeader, getQuery } from 'h3'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { PlexPlayQueue, PlexTrack } from './playMedia.get'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { extractMetadataKeyFromServerPath, getPlexApi, getPlexApiTrack, metadata, responseHeaders } from '~/server/lib/plexApi'
import axios from 'axios'
import { Builder } from 'xml2js'

// catchAll route triggered: /playQueues/7620?window=30&X-Plex-Device-Name=iPhone
const logger = useLogger('playback.playQueues')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  //const plexToken = getRequestHeader(event, 'X-Plex-Token')  
  

  const queryParameters = {
    window: query.window as string,    
  }

  if (!targetClientIdentifier || !clientIdentifier || !deviceName) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) request`,
        { status: 400 }
      )
    )
  }

  logger.debug(`Returnig play queue for player ${targetClientIdentifier} ..: ${JSON.stringify(event.node.req.headers)}`)
  try {
    
    // const playMediaResponse = {
    //   Response: {
    //     $: {
    //       code: 200,
    //       status: 'OK'
    //     }
    //   }
    // }
    // const builder = new Builder({ headless: true })
    // return event.respondWith(
    //   new Response(builder.buildObject(playMediaResponse), { status: 200, headers: { 'Content-Type': 'text/xml' } })
    // )

    setResponseHeaders(event, Object.fromEntries(responseHeaders(targetClientIdentifier, 'Touchy').entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when creating play queue for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for creating play queue, try again later`, { status: 404 })
    )
  }
})
