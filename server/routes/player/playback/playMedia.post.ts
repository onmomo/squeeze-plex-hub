import useLogger from '~/server/composables/useLogger'

const logger = useLogger('playback.playMedia.post')

export default eventHandler(async (event) => {
  logger.info('playMedia', event)
  return 'POST'
})
