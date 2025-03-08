import useLogger from '~/server/composables/useLogger'
import { getRequestHeader, getQuery } from 'h3'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { getPlayQueue, getPlexApi, type PlexServer, responseHeaders } from '~/server/lib/plexApi'
import axios from 'axios'
import { Builder } from 'xml2js'

import type { PlexServerResponse } from '~/server/plugins/gdmDiscovery'
import { type PlayQueue } from '~/server/lib/plexPlayerTimeline'

// catchAll route triggered: /playQueues/7620?window=30&X-Plex-Device-Name=iPhone
const logger = useLogger('playQueues/id.get')
const storage = useStorage('DISCOVERY')
const credentials = useStorage('CREDENTIALS')
const config = useRuntimeConfig()
const builder = new Builder()

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const playQueueID = getRouterParam(event, 'id')?.toString()
  //const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier') // TODO we need this thing
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  //const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  //const plexToken = getRequestHeader(event, 'X-Plex-Token')  // would be available

  logger.info(`queries: ${JSON.stringify(query)}`)
  const queryParameters = {
    window: query.window as string,
    deviceName: getRequestHeader(event, 'X-Plex-Device-Name') as string // sent via query param
  }

  if (!clientIdentifier || !playQueueID) {
    logger.warn(`Missing required parameters ('X-Plex-Client-Identifier', ' playQueueID'), got:`, event.node.req.headers)
    return event.respondWith(new Response(`Missing required parameters ('X-Plex-Client-Identifier' headers) request`, { status: 400 }))
  }

  logger.info(`Returnig play queue '${playQueueID}'`)
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

    // const serverResponse = await storage.getItem<PlexServerResponse>(`plexServer`)
    // if (!serverResponse) {
    //   throw new Error(`No plex server found in storage and playQueue not available`)
    // }

    // const token = (await credentials.getItem<string>('plexToken')) || config.plexToken
    // if (!token) {
    //   logger.warn('No plex token available, abort timeline subscriber update. Please ensure to authenticate Squeeze Plex Hub.')
    //   throw new Error(`No Plex token found in storage`)
    // }

    // const plexServer: PlexServer = {
    //   host: serverResponse.localAddress,
    //   port: serverResponse.port.toString(),
    //   protocol: 'http',
    //   token: token
    // }

    // const url = getPlexApi(plexServer, `/playQueues/${playQueueID}`)
    // const playQueueXml: string = await axios.get(url, {
    //   headers: {
    //     'X-Plex-Token': plexServer.token,
    //     'Accept': 'application/xml'
    //   }
    // }).then((response) => {
    //   return response.data
    // })
    const playQueue = await storage.getItem<PlayQueue>(`playQueue/${playQueueID}`)    
    if (!playQueue) {
      throw new Error(`Play queue '${playQueueID}' not found`)
    }

    //const timelineXml = timelineBody(playerStatus, subscriber, playQueue, queryParameters.includeMetadata)    
    const playQueueXml = builder.buildObject(playQueue)
    //const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'text/xml')
    //logger.info(`Polling player ${targetClientIdentifier} status: ${playerPollStatus}`)
    //return event.respondWith(new Response(xmlString, { status: 200, headers }))

    setResponseHeaders(event, Object.fromEntries(responseHeaders(clientIdentifier, 'Touchy', 'application/xml').entries())) // TODO fix log
    logger.debug(`return playQueue for client ${clientIdentifier} timeline: ${playQueueXml}`)
    return event.respondWith(new Response(playQueueXml, { status: 200 }))
  } catch (error) {
    logger.warn(`Error when resolving playQueue '${playQueueID}'`, error) // TODO fix log
    return event.respondWith(new Response(`Error when resolving playQueue, try again later`, { status: 404 }))
  }
})
