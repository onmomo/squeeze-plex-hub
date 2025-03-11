import useLogger from '~/server/composables/useLogger'
import { getQuery } from 'h3'
import { getPlexApi, type PlexServer } from '~/server/lib/plexApi'
import axios from 'axios'
import { Builder } from 'xml2js'

import type { PlexServerResponse } from '~/server/plugins/gdmDiscovery'

// catchAll route triggered: /playQueues/7620?window=30&X-Plex-Device-Name=iPhone
const logger = useLogger('photo/:/transcode.get')
const storage = useStorage('DISCOVERY')
const credentials = useStorage('CREDENTIALS')
const config = useRuntimeConfig()
const builder = new Builder()

export default eventHandler(async (event) => {
  const query = getQuery(event)

  //logger.info(`queries: ${JSON.stringify(query)}`)
  const queryParameters = {
    width: query.width as string,
    height: query.height as string,
    url: query.url as string,
    quality: query.quality as string,
    format: query.format as string
  }

  if (!queryParameters.url) {
    logger.warn(`Missing required parameters ('url'), got:`, query)
    return event.respondWith(new Response(`Missing required parameters ('url')`, { status: 400 }))
  }

  logger.info(`Returnig cover for key '${queryParameters.url}'`)
  try {
    const serverResponse = await storage.getItem<PlexServerResponse>(`plexServer`)
    if (!serverResponse) {
      throw new Error(`No plex server found in storage and playQueue not available`)
    }

    const token = (await credentials.getItem<string>('plexToken')) || config.plexToken
    if (!token) {
      logger.warn('No plex token available, abort timeline subscriber update. Please ensure to authenticate Squeeze Plex Hub.')
      throw new Error(`No Plex token found in storage`)
    }

    const plexServer: PlexServer = {
      host: serverResponse.localAddress,
      port: serverResponse.port.toString(),
      protocol: 'http',
      token: token
    }

    const url = getPlexApi(plexServer, `${queryParameters.url}`)
    const response = await axios.get(url, {
      headers: {
        'X-Plex-Token': plexServer.token
      }
    })
    
    return event.respondWith(new Response(response.data, { status: 200, headers: { 'Content-Type': 'image/jpeg' } }))
  } catch (error) {
    logger.warn(`Error when transcoding cover photo '${queryParameters.url}'`, error) // TODO fix log
    return event.respondWith(new Response(`Error when transcoding cover photo, try again later`, { status: 404 }))
  }
})
