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
 * Two synced squeeze players acting as one stereo speaker: the left one plays the left channel, the right one the right channel.
 * The pair is announced to Plex under the id of the left player, which controls the sync group.
 */
export interface StereoPair {
  // Name shown in Plexamp, chosen by the user (a pair has no name in LMS)
  name: string
  leftId: string
  rightId: string
}

/**
 * Persisted user configuration, stored as JSON in the `config/` directory.
 */
export interface HubConfig {
  version: number
  players: Record<string, PlayerSettings>
  // Stereo pairs keyed by the player id of their left player
  pairs: Record<string, StereoPair>
  // Players of a dissolved pair that could not be reset because they were unreachable (still synced, left/right output)
  pendingResets: string[]
}

let configDir = resolve(process.cwd(), 'config')
let cachedConfig: Promise<HubConfig> | null = null
let pendingWrite: Promise<unknown> = Promise.resolve()

function defaultConfig(): HubConfig {
  return { version: HUB_CONFIG_VERSION, players: {}, pairs: {}, pendingResets: [] }
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
  const pairs = (raw as Partial<HubConfig> | null)?.pairs
  if (pairs && typeof pairs === 'object') {
    for (const pair of Object.values(pairs)) {
      if (pair && typeof pair.leftId === 'string' && typeof pair.rightId === 'string' && pair.leftId !== pair.rightId) {
        config.pairs[pair.leftId] = {
          name: typeof pair.name === 'string' ? pair.name : pair.leftId,
          leftId: pair.leftId,
          rightId: pair.rightId
        }
      }
    }
  }
  const pendingResets = (raw as Partial<HubConfig> | null)?.pendingResets
  if (Array.isArray(pendingResets)) {
    config.pendingResets = [...new Set(pendingResets.filter((id): id is string => typeof id === 'string'))]
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
 * Applies a change to the config and persists it atomically (temp file + rename).
 * Writes are serialized, so concurrent updates never overwrite each other.
 *
 * @throws An error if the config could not be written, the in-memory config stays unchanged in that case
 */
async function updateHubConfig(change: (current: HubConfig) => HubConfig): Promise<HubConfig> {
  const write = pendingWrite.then(async () => {
    const next = change(await loadHubConfig())

    const file = configFilePath()
    const tmpFile = `${file}.tmp`
    await mkdir(configDir, { recursive: true })
    await writeFile(tmpFile, JSON.stringify(next, null, 2) + '\n', 'utf8')
    await rename(tmpFile, file)

    cachedConfig = Promise.resolve(next)
    return next
  })
  pendingWrite = write.catch(() => undefined)
  return write
}

/**
 * Updates the settings of a player and persists the config.
 *
 * @throws An error if the config could not be written
 */
export async function setPlayerSettings(playerId: string, settings: PlayerSettings): Promise<PlayerSettings> {
  await updateHubConfig((current) => ({ ...current, players: { ...current.players, [playerId]: settings } }))
  useLogger('hubConfig').debug(`Saved settings of player '${playerId}' to '${configFilePath()}'`)
  return settings
}

/**
 * Returns all stereo pairs.
 */
export async function getStereoPairs(): Promise<StereoPair[]> {
  return Object.values((await loadHubConfig()).pairs)
}

/**
 * Finds the stereo pair a player belongs to, as left or right player.
 */
export async function findStereoPair(playerId: string): Promise<{ pair: StereoPair; role: 'left' | 'right' } | undefined> {
  for (const pair of await getStereoPairs()) {
    if (pair.leftId === playerId) return { pair, role: 'left' }
    if (pair.rightId === playerId) return { pair, role: 'right' }
  }
  return undefined
}

/**
 * Saves a stereo pair, replacing a pair with the same left player.
 *
 * @throws An error if the config could not be written
 */
export async function saveStereoPair(pair: StereoPair): Promise<StereoPair> {
  await updateHubConfig((current) => ({
    ...current,
    pairs: { ...current.pairs, [pair.leftId]: pair },
    // The players are configured again, a reset would undo that
    pendingResets: current.pendingResets.filter((id) => id !== pair.leftId && id !== pair.rightId)
  }))
  useLogger('hubConfig').debug(`Saved stereo pair '${pair.name}' to '${configFilePath()}'`)
  return pair
}

/**
 * Removes the stereo pair with the given left player.
 *
 * @throws An error if the config could not be written
 */
export async function removeStereoPair(leftId: string): Promise<void> {
  await updateHubConfig((current) => {
    const { [leftId]: _removed, ...pairs } = current.pairs
    return { ...current, pairs }
  })
}

/**
 * Remembers players that still have to be reset to stereo and unsynced once they are reachable.
 *
 * @throws An error if the config could not be written
 */
export async function addPendingResets(playerIds: string[]): Promise<void> {
  if (playerIds.length === 0) return
  await updateHubConfig((current) => ({ ...current, pendingResets: [...new Set([...current.pendingResets, ...playerIds])] }))
}

export async function getPendingResets(): Promise<string[]> {
  return [...(await loadHubConfig()).pendingResets]
}

/**
 * @throws An error if the config could not be written
 */
export async function removePendingReset(playerId: string): Promise<void> {
  await updateHubConfig((current) => ({ ...current, pendingResets: current.pendingResets.filter((id) => id !== playerId) }))
}
