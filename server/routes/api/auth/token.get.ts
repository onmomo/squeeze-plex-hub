import PlexPin from 'node-plex-api-pinauth'

import { defineEventHandler, getQuery } from 'h3'
import useLogger from '~/server/composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'

export default defineEventHandler(async (event) => {
  const logger = useLogger('token.get')
  const storage = useStorage('CREDENTIALS')

  const plexPin = new PlexPin(plexOptions)

  const query = getQuery(event)
  const pinIdParam = query.pinId as string | undefined
  if (!pinIdParam) {
    throw new Error('No PIN provided')
  }

  logger.info(`Getting token for PinId: ${pinIdParam} ..`)
  interface PlexTokenResponse {
    token: boolean | string
    'auth-token'?: string
  }

  interface TokenResult {
    pinId: string
    status: 'authorized' | 'invalid' | 'waiting'
  }

  return plexPin
    .getToken(pinIdParam)
    .then((res: PlexTokenResponse): TokenResult => {
      if (res.token === true) {
        const token = res['auth-token'] as string
        logger.debug(`Plex token received: ${token}`) // TODO remove debug
        storage.setItem('plexToken', token)

        return {
          pinId: pinIdParam,
          status: 'authorized'
        }
      } else if (res.token === false) {
        logger.error('Timeout!')
        return {
          pinId: pinIdParam,
          status: 'invalid'
        }
      } else {
        logger.debug('No token found yet')
        return {
          pinId: pinIdParam,
          status: 'waiting'
        }
      }
    })
    .catch((err: Error) => logger.error(err.message))
})
