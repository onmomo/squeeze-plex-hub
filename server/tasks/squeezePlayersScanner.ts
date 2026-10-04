import useLogger from '../composables/useLogger'
import { SqueezeServerStub, SqueezeServer } from 'lms-squeeze-rpc-x'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import { playerCapabilitiesKey, type PlayerCapabilities, reconcileStereoPairs, supportsStereoPair } from '../lib/stereoPair'
import { isDemoMode } from '../lib/demoMode'

export default defineTask({
  meta: {
    name: 'squeezePlayersScanner',
    description: 'Discovers Squeeze players on the local network'
  },
  async run(_event) {
    if (isDemoMode()) {
      return { result: 'skipped' }
    }
    await runSqueezePlayersScanner()
    return { result: 'ok' }
  }
})

/**
 * Scans for LMS (Lyrion / Logitech Media Server) players on the network and stores them in the DISCOVERY storage.
 */
export async function runSqueezePlayersScanner() {
  const logger = useLogger('squeezePlayersScanner')
  const storage = useStorage('DISCOVERY')
  logger.debug('Scanning for squeeze devices ..')
  await storage.getKeys('servers/').then(async (servers) => {
    if (!servers) {
      logger.debug('No LMS found in storage, skipping')
      return
    }

    for (const key of servers) {
      logger.debug(`Scanning LMS with key '${key}' ..`)
      const server = await storage.getItem<ServerInfo>(key)
      if (!server) continue
      // One unreachable LMS must not stop the scan of the others and the check of the stereo pairs
      try {
        logger.debug(`Looking for players from LMS '${server.name} (${server.ip})' ..`)
        const client = new SqueezeServerStub(`http://${server.ip}:${server.jsonPort || '9000'}`)
        const lms = new SqueezeServer(client)

        const playerInfos = await lms.getPlayerInfosAsync()
        if (playerInfos.length === 0) {
          logger.info(`No players found on LMS '${server.name}' (${server.ip})`)
        } else {
          logger.info(`Discovered ${playerInfos.length} player(s) on LMS '${server.name}' at ${server.ip}, storing player info`)
          await storage.setItem(`players/${server.uuid}`, playerInfos)
          await storePlayerCapabilities(server, playerInfos)
          logger.debug(`Stored player infos for LMS '${server.name}' (${server.ip})`)
        }
      } catch (error) {
        logger.warn(`Failed to scan LMS '${server.name}' (${server.ip}):`, error)
      }
    }
  })

  // Restore stereo pairs that LMS lost (restart, player reboot, sync group changed), after the players are up to date
  try {
    await reconcileStereoPairs()
  } catch (error) {
    logger.warn('Failed to check stereo pairs:', error)
  }
}

const CAPABILITY_RECHECK_MS = 10 * 60 * 1000

/**
 * Remembers which players offer the output channel setting that stereo pairs need.
 */
async function storePlayerCapabilities(server: ServerInfo, playerInfos: IPlayerInfo[]) {
  const storage = useStorage('DISCOVERY')
  const stub = new SqueezeServerStub(`http://${server.ip}:${server.jsonPort || '9000'}`)
  // In parallel, so an unreachable player delays the scan only once
  await Promise.allSettled(
    playerInfos.map(async ({ playerid }) => {
      const known = await storage.getItem<PlayerCapabilities>(playerCapabilitiesKey(playerid))
      // A player that offers the setting keeps it. "No" may only be a reading of a disconnected player, ask again after a while
      if (known && (known.outputChannels || Date.now() - (known.checkedAt ?? 0) < CAPABILITY_RECHECK_MS)) return
      try {
        const outputChannels = await supportsStereoPair(stub, playerid)
        await storage.setItem<PlayerCapabilities>(playerCapabilitiesKey(playerid), { outputChannels, checkedAt: Date.now() })
      } catch (error) {
        useLogger('squeezePlayersScanner').debug(`Could not read the capabilities of player '${playerid}':`, error)
      }
    })
  )
}
