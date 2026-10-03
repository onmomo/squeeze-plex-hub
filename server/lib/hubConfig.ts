import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import useLogger from '../composables/useLogger'
import { isDemoMode } from './demoMode'

export const HUB_CONFIG_VERSION = 1

/**
 * User settings of a single squeeze player, keyed by its player id in `HubConfig.players`.
 */
export interface PlayerSettings {
  // Hidden players are not announced to Plex clients. Player names belong to LMS and are not stored here
  hidden: boolean
}

/**
 * Persisted user configuration, stored as JSON in the `config/` directory.
 */
export interface HubConfig {
  version: number
  players: Record<string, PlayerSettings>
}

let configDir = resolve(process.cwd(), 'config')
let cachedConfig: Promise<HubConfig> | null = null
let pendingWrite: Promise<unknown> = Promise.resolve()

function defaultConfig(): HubConfig {
  return { version: HUB_CONFIG_VERSION, players: {} }
}

/**
 * Overrides the config directory and clears the cache (used by tests).
 */
export function setConfigDir(dir: string) {
  configDir = dir
  cachedConfig = null
}

/**
 * Absolute path of the settings file. Demo mode uses its own file so it never touches the real settings.
 */
export function configFilePath(): string {
  return join(configDir, isDemoMode() ? 'settings.demo.json' : 'settings.json')
}

function normalize(raw: unknown): HubConfig {
  const config = defaultConfig()
  const players = (raw as Partial<HubConfig> | null)?.players
  if (players && typeof players === 'object') {
    for (const [playerId, settings] of Object.entries(players)) {
      if (settings && typeof settings === 'object') {
        config.players[playerId] = { hidden: settings.hidden === true }
      }
    }
  }
  return config
}

/**
 * Loads the hub config from disk once and caches it. A missing or unreadable file results in the default config.
 */
export async function loadHubConfig(): Promise<HubConfig> {
  if (!cachedConfig) {
    cachedConfig = readHubConfig()
  }
  return cachedConfig
}

async function readHubConfig(): Promise<HubConfig> {
  const logger = useLogger('hubConfig')
  const file = configFilePath()
  try {
    const config = normalize(JSON.parse(await readFile(file, 'utf8')))
    logger.info(`Loaded settings from '${file}'`)
    return config
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info(`No settings found at '${file}', all players are visible`)
    } else {
      logger.warn(`Failed to read settings from '${file}', falling back to defaults:`, error)
    }
    return defaultConfig()
  }
}

/**
 * Returns the settings of a player, all players are visible by default.
 */
export async function getPlayerSettings(playerId: string): Promise<PlayerSettings> {
  const config = await loadHubConfig()
  return config.players[playerId] ?? { hidden: false }
}

export async function isPlayerHidden(playerId: string): Promise<boolean> {
  return (await getPlayerSettings(playerId)).hidden
}

/**
 * Updates the settings of a player and persists the config atomically (temp file + rename).
 * Writes are serialized, so concurrent updates never overwrite each other.
 *
 * @throws An error if the config could not be written, the in-memory config stays unchanged in that case
 */
export async function setPlayerSettings(playerId: string, settings: PlayerSettings): Promise<PlayerSettings> {
  const write = pendingWrite.then(async () => {
    const current = await loadHubConfig()
    const next: HubConfig = { ...current, players: { ...current.players, [playerId]: settings } }

    const file = configFilePath()
    const tmpFile = `${file}.tmp`
    await mkdir(configDir, { recursive: true })
    await writeFile(tmpFile, JSON.stringify(next, null, 2) + '\n', 'utf8')
    await rename(tmpFile, file)

    cachedConfig = Promise.resolve(next)
    useLogger('hubConfig').debug(`Saved settings of player '${playerId}' to '${file}'`)
    return settings
  })
  pendingWrite = write.catch(() => undefined)
  return write
}
