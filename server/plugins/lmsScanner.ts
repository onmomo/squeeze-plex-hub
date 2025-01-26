import useLogger from '../composables/useLogger'
import discovery from 'lms-discovery'

const logger = useLogger('lmsScanner')

export default defineNitroPlugin(() => {
  squeezeScanner()
})

/**
 * Scans for LMS (Logitech Media Server) devices on the network and stores them in the DISCOVERY storage.
 */
function squeezeScanner() {
  const storage = useStorage('DISCOVERY')
  //const scheduler = useScheduler()
  discovery.start()
  logger.debug('Scanning for squeeze devices ..')
  discovery.on('discovered', async (server) => {    
    logger.info('Server discovered:', server)
    await storage.setItem('servers' + server.uuid, server)
  })
}
