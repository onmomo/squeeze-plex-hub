import useLogger from '../composables/useLogger'
import { demoServers } from '../lib/demoData'
import { isDemoMode } from '../lib/demoMode'

export default defineNitroPlugin(async () => {
  await seedDemoData()
})

/**
 * Seeds fake LMS servers and players into the DISCOVERY storage when demo mode is enabled.
 */
export async function seedDemoData() {
  if (!isDemoMode()) {
    return
  }

  const logger = useLogger('demoMode')
  const storage = useStorage('DISCOVERY')
  const imageLms = parseHostPort(useRuntimeConfig().demoLms)
  for (const { server, players } of demoServers) {
    // The dashboard loads player model images from the LMS address, point it to a real LMS if one is configured
    const demoServer = imageLms ? { ...server, ip: imageLms.host, jsonPort: imageLms.port } : server
    await storage.setItem(`servers/${server.uuid}`, demoServer)
    await storage.setItem(`players/${server.uuid}`, players)
  }
  logger.warn('Demo mode enabled: serving fake LMS servers and players, network discovery is disabled')
  if (imageLms) {
    logger.info(`Demo mode loads player images from LMS at ${imageLms.host}:${imageLms.port}`)
  }
}

function parseHostPort(value: unknown): { host: string; port: string } | undefined {
  const match = typeof value === 'string' ? value.trim().match(/^([^:\s]+)(?::(\d+))?$/) : null
  return match ? { host: match[1]!, port: match[2] ?? '9000' } : undefined
}
