import useLogger from '../composables/useLogger'
import discovery from 'lms-discovery'

export default defineNitroPlugin(() => {
  runSqueezeScanner()
})

/**
 * Scans for LMS Lyron Music Server (former Logitech Media Server) devices on the network and stores them in the DISCOVERY storage.
 */
export function runSqueezeScanner() {  
  const logger = useLogger('lmsScanner')
  const storage = useStorage('DISCOVERY')
  try {     
    discovery.start()    
    logger.info('Scanning for LMS ..')
    discovery.on('discovered', async (server) => {      
      if (server) {
        logger.info(`LMS '${server.name}'@'${server.ip}:${server.jsonPort}' discovered`)
        await storage.setItem('servers/' + server.uuid, server)
      }
    })
    discovery.on('lost', async (server) => {
      if (server) {
        logger.info(`LMS ${server.name}@${server.ip}:${server.jsonPort} lost`)
        await storage.remove('servers/' + server.uuid, server)
      }
    })
    discovery.on('error', async (error) => {
      logger.warn('Error while scanning for LMS:', error)
    })
  } catch (error) {    
    logger.error('Error scanning for LMS, restart Squeeze Plex Hub to resolve:', error)
  }
}
