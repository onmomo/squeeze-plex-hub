import PlexPin from 'node-plex-api-pinauth'

import { defineEventHandler } from 'h3'
import useLogger from '~/server/composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'

export default defineEventHandler(async () => {
  const logger = useLogger('pin.get')
  try {   
    const plexPin = new PlexPin(plexOptions)
    logger.info('Fetching new PIN for SqueezePlexHub ..')
    return plexPin.getPin()
  } catch (error) {
    logger.error('Failed to request PIN from plex:', error)
    throw new Error('Error fetching PIN')
  }
})
