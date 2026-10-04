import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  configFilePath,
  findStereoPair,
  getPlayerSettings,
  getStereoPairs,
  isPlayerHidden,
  loadHubConfig,
  removeStereoPair,
  saveStereoPair,
  setConfigDir,
  setPlayerSettings
} from './hubConfig'

vi.mock('../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

describe('hubConfig', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hub-config-'))
    setConfigDir(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('stores settings in config/settings.json', () => {
    expect(configFilePath()).toBe(join(dir, 'settings.json'))
  })

  it('keeps demo settings in a separate file', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true }))
    expect(configFilePath()).toBe(join(dir, 'settings.demo.json'))
    vi.stubGlobal('useRuntimeConfig', () => ({ appVersion: '1.2.3-test' }))
  })

  it('makes all players visible when no settings file exists', async () => {
    expect(await loadHubConfig()).toEqual({ version: 1, players: {}, pairs: {}, pendingResets: [] })
    expect(await isPlayerHidden('00:04:20:aa:bb:cc')).toBe(false)
  })

  it('falls back to defaults if the settings file is invalid', async () => {
    await writeFile(join(dir, 'settings.json'), '{ not json')
    expect(await loadHubConfig()).toEqual({ version: 1, players: {}, pairs: {}, pendingResets: [] })
  })

  it('falls back to defaults if the settings file has no players', async () => {
    await writeFile(join(dir, 'settings.json'), 'null')
    expect(await loadHubConfig()).toEqual({ version: 1, players: {}, pairs: {}, pendingResets: [] })
  })

  it('ignores fields it does not know, e.g. names written by older versions', async () => {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ version: 1, players: { a: { name: 'Kitchen', hidden: true } } }))
    expect(await loadHubConfig()).toEqual({ version: 1, players: { a: { hidden: true } }, pairs: {}, pendingResets: [] })
  })

  it('ignores malformed player entries', async () => {
    await writeFile(join(dir, 'settings.json'), JSON.stringify({ players: { a: { hidden: true }, b: 'nope', c: { hidden: 'yes' } } }))
    expect(await loadHubConfig()).toEqual({
      version: 1,
      players: { a: { hidden: true }, c: { hidden: false } },
      pairs: {},
      pendingResets: []
    })
  })

  it('persists player settings as readable json', async () => {
    await setPlayerSettings('00:04:20:aa:bb:cc', { hidden: true })

    expect(await isPlayerHidden('00:04:20:aa:bb:cc')).toBe(true)
    const file = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'))
    expect(file).toEqual({ version: 1, players: { '00:04:20:aa:bb:cc': { hidden: true } }, pairs: {}, pendingResets: [] })

    // Survives a restart
    setConfigDir(dir)
    expect(await getPlayerSettings('00:04:20:aa:bb:cc')).toEqual({ hidden: true })
  })

  it('keeps all concurrent updates', async () => {
    await Promise.all([
      setPlayerSettings('a', { hidden: true }),
      setPlayerSettings('b', { hidden: true }),
      setPlayerSettings('c', { hidden: false })
    ])

    setConfigDir(dir)
    expect(Object.keys((await loadHubConfig()).players).sort()).toEqual(['a', 'b', 'c'])
  })

  it('rejects and keeps the previous settings if the config cannot be written', async () => {
    await setPlayerSettings('a', { hidden: true })
    // A directory in place of the temp file makes the write fail
    await mkdir(join(dir, 'settings.json.tmp'))
    await expect(setPlayerSettings('a', { hidden: false })).rejects.toThrow()
    expect(await isPlayerHidden('a')).toBe(true)
    // Later writes still work once the problem is gone
    await rm(join(dir, 'settings.json.tmp'), { recursive: true })
    await setPlayerSettings('a', { hidden: false })
    expect(await isPlayerHidden('a')).toBe(false)
  })

  describe('stereo pairs', () => {
    const kitchen = { name: 'Kitchen', leftId: 'aa', rightId: 'bb' }

    it('persists a pair and finds it by either member', async () => {
      await saveStereoPair(kitchen)
      expect(await getStereoPairs()).toEqual([kitchen])
      expect(await findStereoPair('aa')).toEqual({ pair: kitchen, role: 'left' })
      expect(await findStereoPair('bb')).toEqual({ pair: kitchen, role: 'right' })
      expect(await findStereoPair('cc')).toBeUndefined()

      setConfigDir(dir)
      expect(await getStereoPairs()).toEqual([kitchen])
      expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).pairs).toEqual({ aa: kitchen })
    })

    it('removes a pair and keeps player settings', async () => {
      await setPlayerSettings('cc', { hidden: true })
      await saveStereoPair(kitchen)
      await removeStereoPair('aa')
      expect(await getStereoPairs()).toEqual([])
      expect(await isPlayerHidden('cc')).toBe(true)
    })

    it('ignores invalid pairs in the settings file', async () => {
      await writeFile(
        join(dir, 'settings.json'),
        JSON.stringify({
          version: 1,
          players: {},
          pairs: { x: { leftId: 'x', rightId: 'x' }, y: { name: 1, leftId: 'y', rightId: 'z' }, w: null }
        })
      )
      expect(await getStereoPairs()).toEqual([{ name: 'y', leftId: 'y', rightId: 'z' }])
    })
  })
})
