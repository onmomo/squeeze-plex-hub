import useLogger from '../composables/useLogger'
import discovery from 'lms-discovery'
import { SqueezeServerStub } from 'lms-squeeze-rpc'

const logger = useLogger('lmsScanner')

export default defineNitroPlugin(() => {
  squeezeScanner()
})

/**
 * Scans for LMS (Logitech Media Server) devices on the network and stores them in the DISCOVERY storage.
 */
function squeezeScanner() {
  try {
    const storage = useStorage('DISCOVERY')
    // const scheduler = useScheduler();
    discovery.start()
    logger.debug('Scanning for squeeze devices ..')

    discovery.on('discovered', async (server) => {
      try {
        if (server) {
          logger.info('Server discovered:', server)          
          await storage.setItem('servers/' + server.uuid, server)          
        }
      } catch (error) {
        logger.error('Error processing discovered server:', error)
      }
    })
  } catch (error) {
    logger.error('Error in squeezeScanner:', error)
  }
}
