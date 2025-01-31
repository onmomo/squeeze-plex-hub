import { plexOptions } from '~/server/lib/squeezePlexHub'
import { defineEventHandler, getQuery } from 'h3'
import useLogger from '~/server/composables/useLogger'
import type { PlexServerResponse } from '~/server/plugins/gdmDiscovery'
import axios from 'axios'

export default defineEventHandler(async (event) => {
  const logger = useLogger('session.get')
  const credentials = useStorage('CREDENTIALS')
  const discovery = useStorage('DISCOVERY')

  const plexServer = await discovery.getItem<PlexServerResponse>('plexServer')
  if (!plexServer) {
    logger.info('No plex server found in storage')
    return { status: 'plex-not-found' }
  }

  const token = await credentials.getItem('plexToken')
  if (token) {
    logger.info('Token found in storage, fetching server info to validate token..')
    // TODO: Add error handling 401 / 403 in case token is invalid
    const serverInfo = await axios.get(`http://${plexServer.localAddress}:${plexServer.port}`, {
      headers: {
        'X-Plex-Token': token.toString(),
        Accept: 'application/json'
      }
    })
    
    return {
      status: 'authorized',
      clientIdentifier: plexOptions.identifier,
      serverInfo: serverInfo.data.MediaContainer
    }
  } else {
    logger.info('No token found in storage')
    return { status: 'unauthorized' }
  }
})
