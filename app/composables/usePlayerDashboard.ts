import type { ServerInfo } from 'lms-discovery'
import { FetchError } from 'ofetch'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import type { PlayerServerInfo } from '../../server/routes/api/players.get'

export interface DashboardPlayer {
  id: string
  name: string
  model: string
  modelName: string
  ip: string
  firmware: string
  // Model images on Lyrion in the order Lyrion itself picks them, the first one that exists is shown
  imageUrls: string[]
  // Hidden players are not announced to Plex clients
  hidden: boolean
  // A settings change is being saved
  saving: boolean
  // Lyrion offers the output channel setting of this player, needed for stereo pairs. Unknown counts as yes
  canPair: boolean
}

/**
 * Two players acting as one stereo speaker. It is rendered as one card for the left player, which is the pair's
 * Plex target: its `player` carries the pair name and the visibility.
 */
export interface DashboardPair {
  // Player id of the left player, which identifies the pair
  leftId: string
  // LMS names of the members, `player.name` is the pair name. A member that is not known (offline) shows as such
  leftName: string
  rightName: string
  // `offline`: a member is not connected, `error`: the hub could not restore the pair. Both are checked every minute
  problem?: 'offline' | 'error'
}

/**
 * Something rendered inside a server section, sections render items, never raw players.
 */
export type DashboardItem =
  | { kind: 'player'; id: string; player: DashboardPlayer }
  | { kind: 'pair'; id: string; player: DashboardPlayer; pair: DashboardPair }

export interface ServerSection {
  server: ServerInfo
  items: DashboardItem[]
  hiddenItems: DashboardItem[]
}

const POLL_INTERVAL_MS = 5000

/**
 * Lyrion's choice of player image (Slim/Web/Settings/Player/Basic.pm): Squeezelite players may have an image named after their
 * model name (e.g. pCP), Squeezebox 2 uses the Squeezebox image, and players without an image of their own get the
 * Softsqueeze one.
 */
export function playerImageUrls(playerInfo: IPlayerInfo, serverInfo: ServerInfo): string[] {
  const names: string[] = []
  if (playerInfo.model === 'squeezelite') {
    names.push(playerInfo.modelname.toLowerCase().replace(/[^-_a-z0-9]/g, ''))
  }
  names.push(playerInfo.model === 'squeezebox2' ? 'squeezebox' : playerInfo.model, 'softsqueeze')
  return [...new Set(names.filter(Boolean))].map(
    (name) => `http://${serverInfo.ip}:${serverInfo.jsonPort}/html/images/Players/${name}_250x250.png`
  )
}

function toDashboardPlayer({ playerInfo, serverInfo, settings, canPair }: PlayerServerInfo, savingHidden?: boolean): DashboardPlayer {
  return {
    id: playerInfo.playerid,
    name: playerInfo.name,
    model: playerInfo.model,
    modelName: playerInfo.modelname,
    ip: playerInfo.ip,
    firmware: playerInfo.firmware,
    imageUrls: playerImageUrls(playerInfo, serverInfo),
    hidden: savingHidden ?? settings?.hidden ?? false,
    saving: savingHidden !== undefined,
    canPair: canPair !== false
  }
}

/**
 * Loads the discovered players, keeps them up to date and changes their Plex visibility.
 */
export function usePlayerDashboard() {
  const toast = useToast()
  const players = ref<PlayerServerInfo[]>([])
  const loading = ref(true)
  const error = ref(false)
  // Optimistic visibility per player id, wins over polled data until the change is saved
  const savingHidden = reactive(new Map<string, boolean>())
  let intervalId: ReturnType<typeof setInterval> | null = null

  async function refresh() {
    try {
      players.value = await $fetch<PlayerServerInfo[]>('/api/players')
      loading.value = players.value.length === 0
      error.value = false
    } catch (err) {
      // 404: no LMS or players discovered yet, keep scanning
      if (!(err instanceof FetchError && err.statusCode === 404)) {
        console.error('Error fetching discovered players:', err)
        error.value = true
        loading.value = false
      }
    }
  }

  const sections = computed<ServerSection[]>(() => {
    const byServer = new Map<string, ServerSection>()
    for (const entry of players.value) {
      const section = byServer.get(entry.serverInfo.uuid) ?? { server: entry.serverInfo, items: [], hiddenItems: [] }
      byServer.set(entry.serverInfo.uuid, section)

      const player = toDashboardPlayer(entry, savingHidden.get(entry.playerInfo.playerid))
      let item: DashboardItem = { kind: 'player', id: player.id, player }
      if (entry.pair) {
        const partner = players.value.find((candidate) => candidate.playerInfo.playerid === entry.pair!.partnerId)
        // The right player is shown on the card of the left one, as long as that card can be rendered
        if (entry.pair.role === 'right' && partner) continue
        const [leftName, rightName] =
          entry.pair.role === 'left' ? [player.name, partner?.playerInfo.name ?? 'Not found'] : ['Not found', player.name]
        item = {
          kind: 'pair',
          id: player.id,
          // Same name as in Plexamp (server/lib/plexTargets.ts)
          player: { ...player, name: entry.pair.name.includes('⇄') ? entry.pair.name : `${entry.pair.name} ⇄` },
          pair: {
            leftId: entry.pair.leftId,
            leftName,
            rightName,
            problem: entry.pair.state === 'offline' || entry.pair.state === 'error' ? entry.pair.state : undefined
          }
        }
      }
      ;(player.hidden ? section.hiddenItems : section.items).push(item)
    }

    const byName = (a: DashboardItem, b: DashboardItem) => a.player.name.localeCompare(b.player.name)
    return [...byServer.values()]
      .map((section) => ({ ...section, items: section.items.sort(byName), hiddenItems: section.hiddenItems.sort(byName) }))
      .sort((a, b) => a.server.name.localeCompare(b.server.name))
  })

  const stats = computed(() => {
    const all = sections.value.flatMap((section) => [...section.items, ...section.hiddenItems])
    return {
      servers: sections.value.length,
      players: all.length,
      hidden: all.filter((item) => item.player.hidden).length
    }
  })

  /** Players of the same server that can still become the partner of the given player */
  function pairCandidates(player: DashboardPlayer): DashboardPlayer[] {
    const serverId = players.value.find((entry) => entry.playerInfo.playerid === player.id)?.serverInfo.uuid
    return players.value
      .filter(
        (entry) => entry.serverInfo.uuid === serverId && entry.playerInfo.playerid !== player.id && !entry.pair && entry.canPair !== false
      )
      .map((entry) => toDashboardPlayer(entry))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async function createPair(name: string, left: DashboardPlayer, right: DashboardPlayer): Promise<boolean> {
    try {
      await $fetch('/api/pairs', { method: 'POST', body: { name, leftId: left.id, rightId: right.id } })
      await refresh()
      toast.add({
        title: `${name} is a stereo pair`,
        description: `${left.name} plays left, ${right.name} right.`,
        icon: 'i-lucide-audio-lines',
        color: 'primary'
      })
      return true
    } catch (err) {
      console.error(`Error creating stereo pair '${name}':`, err)
      toast.add({
        title: `Couldn't create ${name}`,
        description:
          err instanceof FetchError && err.statusMessage
            ? err.statusMessage
            : 'Check that both players are connected to Lyrion, then try again.',
        icon: 'i-lucide-triangle-alert',
        color: 'error'
      })
      return false
    }
  }

  async function dissolvePair(left: DashboardPlayer, leftId = left.id) {
    try {
      await $fetch(`/api/pairs/${encodeURIComponent(leftId)}`, { method: 'DELETE' })
      await refresh()
      toast.add({
        title: `${left.name} dissolved`,
        description: 'Both players play stereo again.',
        icon: 'i-lucide-unlink',
        color: 'neutral'
      })
    } catch (err) {
      console.error(`Error dissolving stereo pair '${left.name}':`, err)
      toast.add({ title: `Couldn't dissolve ${left.name}`, icon: 'i-lucide-triangle-alert', color: 'error' })
    }
  }

  // One message for visibility changes: a new change closes the previous one, so Undo always reverts the latest change
  let visibilityToastId: string | number | undefined
  function showVisibilityToast(message: Parameters<typeof toast.add>[0]) {
    if (visibilityToastId !== undefined) {
      toast.remove(visibilityToastId)
    }
    visibilityToastId = toast.add(message).id
  }

  async function setHidden(player: DashboardPlayer, hidden: boolean) {
    savingHidden.set(player.id, hidden)
    try {
      await $fetch(`/api/players/${encodeURIComponent(player.id)}/settings`, { method: 'PATCH', body: { hidden } })
      const entry = players.value.find((p) => p.playerInfo.playerid === player.id)
      if (entry) {
        entry.settings = { hidden }
      }
      showVisibilityToast({
        title: hidden ? `${player.name} hidden` : `${player.name} in Plexamp`,
        description: hidden ? 'Plexamp no longer lists it. Restart Plexamp if it still does.' : undefined,
        icon: hidden ? 'i-lucide-eye-off' : 'i-lucide-radio',
        color: hidden ? 'neutral' : 'primary',
        actions: [{ label: 'Undo', color: 'neutral', variant: 'outline', onClick: () => setHidden(player, !hidden) }]
      })
    } catch (err) {
      console.error(`Error saving settings of player '${player.name}':`, err)
      showVisibilityToast({
        title: `Couldn't save ${player.name}`,
        description: 'Check that the config directory of Squeeze Plex Hub is writable, then try again.',
        icon: 'i-lucide-triangle-alert',
        color: 'error'
      })
    } finally {
      savingHidden.delete(player.id)
    }
  }

  onMounted(() => {
    refresh()
    intervalId = setInterval(refresh, POLL_INTERVAL_MS)
  })
  onUnmounted(() => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  })

  return { sections, stats, loading, error, refresh, setHidden, pairCandidates, createPair, dissolvePair }
}
