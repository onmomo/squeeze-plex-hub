import PlexPin from 'node-plex-api-pinauth'

import { defineEventHandler, getQuery } from 'h3'
import useLogger from '~/server/composables/useLogger'


export default defineEventHandler(async (event) => {
  const logger = useLogger('session.get')
  const storage = useStorage('CREDENTIALS')

  const token = await storage.getItem('plexToken')
  if (token) {
    logger.info('Token found in storage')
    // use token to get user plex server info and return it
    return { status: 'authorized' }
  } else {
    logger.info('No token found in storage')
    return { status: 'unauthorized' }
  }
  
})
