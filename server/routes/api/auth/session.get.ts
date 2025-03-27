import { plexOptions } from '~/server/lib/squeezePlexHub'
import { defineEventHandler } from 'h3'
import useLogger from '~/server/composables/useLogger'
import type { PlexServerResponse } from '~/server/plugins/gdmDiscovery'
import axios from 'axios'

export default defineEventHandler(async () => {
  const logger = useLogger('session.get')
  const credentials = useStorage('CREDENTIALS')
  const discovery = useStorage('DISCOVERY')
  const config = useRuntimeConfig()

  const plexServer = await discovery.getItem<PlexServerResponse>('plexServer')
  if (!plexServer) {
    logger.info('No plex server found in storage')
    return { status: 'plex-not-found' }
  }

  const token = await credentials.getItem<string>('plexToken') || config.plexToken
  if (!token) {
    logger.info('No token found in storage')
    return { status: 'unauthorized' }
  }

  logger.info('Token found in storage, fetching server info to validate token..')
  try {
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
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        logger.warn('Unauthorized access, invalid token in storage')
        await credentials.removeItem('plexToken')
        return { status: 'unauthorized' }
      }
    }

    logger.error('Failed to fetch server info', error)
    throw new Error('Failed to fetch server info')
  }
})
