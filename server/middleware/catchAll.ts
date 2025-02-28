import useLogger from "../composables/useLogger"

const logger = useLogger('catchAll')

export default eventHandler(async (event) => {
    logger.debug(`catchAll route triggered: ${event.method} ${event.path}`)    
  })

  