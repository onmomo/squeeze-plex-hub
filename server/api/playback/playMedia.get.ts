import useLogger from '~/server/composables/useLogger'

const logger = useLogger('playback.playMedia.get')

export default eventHandler(async (event) => {
  logger.info('playMedia', event)
  return 'GET'
})
