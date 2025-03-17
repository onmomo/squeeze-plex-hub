import useLogger from "../composables/useLogger"

const logger = useLogger('catchAll')

export default eventHandler(async (event) => {
    logger.debug(`Requested route: ${event.method} ${event.path}`)    
  })

  