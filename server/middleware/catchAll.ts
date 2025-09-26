import useLogger from "../composables/useLogger"
import { eventHandler } from 'h3'

const logger = useLogger('catchAll')

export default eventHandler(async (event) => {
    // Log the incoming request method and path for investigation purposes
    logger.debug(`Received request: ${event.method} ${event.path}`)    
  })

  