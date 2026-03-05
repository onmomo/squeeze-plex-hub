import useLogger from '../composables/useLogger'

const { appVersion } = useRuntimeConfig()
const logger = useLogger('squeezePlexHub')
const DefaultPort = '3000'

function isValidPort(port: string | undefined): boolean {
  if (!port) {
    // no port ENV configured 
    return false
  }

  if (Number.isInteger(port)) {
    const portNumber = Number.parseInt(port, 10)
    return portNumber > 0 && portNumber <= 65535
  }

  if (typeof port === 'string' && /^\d+$/.test(port)) {
    const parsed = Number.parseInt(port, 10)
    return parsed > 0 && parsed <= 65535
  }

  logger.warn(`Invalid port value '${port}' of type '${typeof port}' provided.`)
  return false
}

export function resolveNuxtServerPort(): string {
  const portCandidates = [
    process.env.NITRO_PORT,
    process.env.PORT    
  ]

  const resolvedPort = portCandidates.find(isValidPort)
  logger.debug(`Resolved Squeeze Plex Hub server port: ${resolvedPort}`)
  
  if (!resolvedPort) {    
    return DefaultPort
  }

  return resolvedPort
}

export const plexOptions = {
  identifier: 'SqueezePlexHub',
  product: 'Squeeze Plex Hub', // Plexamp, Plex Web,
  version: appVersion,
  device: 'Windows', // $device:$model combination found to be accepted by :/timeline endpoint = Windows:$ANYSTRING, Android:$ANYSTRING iOS:$ANYSTRING
  model: 'Squeezebox Player',
  platform: 'Squeeze Plex Hub', // Linux, Safari
  platformVersion: appVersion,
  deviceClass: 'speaker', // will result in a speaker icon on mobile (also possible values: stb, tablet, mobile, pc)
  protocol: 'plex',
  protocolVersion: '1',
  protocolCapabilities: 'timeline,playback,playqueues,playqueues-creation',
  controllable: 'volume,repeat,skipPrevious,seekTo,stepBack,stepForward,stop,playPause',
  get port() {
    return resolveNuxtServerPort()
  }
}
