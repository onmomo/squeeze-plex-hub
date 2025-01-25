import { useScheduler } from '#scheduler'
import useLogger from '../composables/useLogger'

const logger = useLogger('squeezeScanner')

export default defineNitroPlugin(() => {
  squeezeScanner()
})

function squeezeScanner() {
  const scheduler = useScheduler()

  scheduler
    .run(() => {
      logger.debug('Scanning for squeeze devices ..')      
    })
    .everySeconds(10)    
}
