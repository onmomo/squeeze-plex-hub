import useLogger from '~/server/composables/useLogger'

const logger = useLogger('timeline.subscribe.get')

export default eventHandler(async (event) => {
  logger.info('subscribe', event)
  return 'GET'
})
