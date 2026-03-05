import { createLogger, transports } from 'winston'

export default function useLogger(service?: string) {
  const { logLevel } = useRuntimeConfig()
  return createLogger({
    level: logLevel?.toLowerCase(),
    defaultMeta: { service },
    transports: [new transports.Console()]
  })
}
