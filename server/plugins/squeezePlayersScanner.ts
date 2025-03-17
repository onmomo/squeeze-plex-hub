import { createServer } from 'http'
import { toNodeListener } from 'h3'
import { useScheduler } from '#scheduler'
import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'
import type { NitroApp } from 'nitropack'

const logger = useLogger('squeezePlayersScanner')

export default defineNitroPlugin((app: NitroApp) => {
  squeezePlayersScanner(app)
})

/**
 * Scans for LMS (Logitech Media Server) players on the network and stores them in the DISCOVERY storage.
 */
function squeezePlayersScanner(app: NitroApp) {
  const storage = useStorage('DISCOVERY')
  const scheduler = useScheduler()

  scheduler
    .run(() => {
      logger.debug('Scanning for squeeze devices ..')
      storage.getKeys('servers/').then(async (servers) => {
        if (!servers) {
          logger.debug('No LMS found in storage, skipping')
          return
        }

        for (const key of servers) {
          const server = await storage.getItem<ServerInfo>(key)
          if (server) {
            logger.debug(`Looking for players from LMS '${server.name} (${server.ip})' ..`)
            const client = new SqueezeServerStub(`http://${server.ip}:${server.jsonPort || '9000'}`)
            const squeeze = new SqueezeServer(client)

            const playerInfos = await squeeze.getPlayerInfosAsync()
            logger.info(`Found '${playerInfos.length}' squeeze players on LMS '${server.name} (${server.ip})'`)

            // Store player information
            await storage.setItem(`players/${server.uuid}`, playerInfos)

            for (const player of playerInfos) {
              // Check if the player already has a port assigned
              let port = await storage.getItem<number>(`playerPorts/${player.playerid}`)

              if (!port) {
                // Assign a new unique port if not already assigned
                port = await getUniquePort(storage)

                // Attempt to create the server and bind it to the port
                const playerServer = createServer(toNodeListener(app.h3App))
                playerServer.listen(port)     
                try {            
                  // TODO make sure to unbinx server.close() if player is no longer available      
                  playerServer.on('listening', async () => {
                    const address = playerServer.address()
                    const actualPort = typeof address === 'object' && address ? address.port : port
                    logger.info(`Player '${player.name}' is listening on port ${actualPort} ..`)
                    // Persist the port only if the server was successfully created                  
                    await storage.setItem(`playerPorts/${player.playerid}`, actualPort)
                  })                  
                  playerServer.on('error', (error) => {
                    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {                      
                      setTimeout(async () => {                                                
                        logger.info(JSON.stringify(error))
                        // TODO improve
                        const actualPort = (error as any).port
                        const test = actualPort + 1
                        logger.info(test)
                        const retryPort = await getUniquePort(storage, test)
                        logger.warn(`Player '${player.name}' port '${actualPort}' already in use, retrying with port '${retryPort}'`)
                        playerServer.close()
                        playerServer.listen(retryPort)
                      }, 1000)
                    }
                    throw error
                  })                               
                } catch (error) {
                  logger.warn(`Failed to bind player '${player.name}' to '${port}', retry next interation:`, error)
                }
              }
            }
          }
        }
      })
    })
    .everySeconds(10)
}

/**
 * Generates a unique port that is not already in use from squeeze plex hub starting from 32500.
 * @param storage The storage to check for used ports.
 * @returns A unique port.
 */
async function getUniquePort(storage: ReturnType<typeof useStorage>, initialPort?: number): Promise<number> {
  const usedPorts = new Set(
    await storage.getKeys('playerPorts/').then((keys) => Promise.all(keys.map((key) => storage.getItem<number>(key))))
  )
  
  let port = initialPort || 32500
  while (usedPorts.has(port)) {
    port++
    if (port > 65535) {
      throw new Error('No available ports in the range 32500-65535')
    }
  }

  return port
}
