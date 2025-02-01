import PlexPin from 'node-plex-api-pinauth'

import { defineEventHandler, getQuery } from 'h3'
import useLogger from '~/server/composables/useLogger'


export default defineEventHandler(async (event) => {
  const logger = useLogger('session.delete')
  const storage = useStorage('CREDENTIALS')

  await storage.removeItem('plexToken')
  logger.info('Token removed from storage')
  sendNoContent(event)
  
})
