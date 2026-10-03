import type { ServerInfo } from 'lms-discovery'
import { FetchError } from 'ofetch'
import type { PlayerServerInfo } from '../../server/routes/api/players.get'

export interface DashboardPlayer {
  id: string
  name: string
  model: string
  modelName: string
  ip: string
  firmware: string
  imageUrl: string
  // Hidden players are not announced to Plex clients
  hidden: boolean
  // A settings change is being saved
  saving: boolean
}

/**
 * Something rendered inside a server section. Player groups (rooms, stereo pairs) will join this union later,
 * sections render items, never raw players.
 */
export type DashboardItem = { kind: 'player'; id: string; player: DashboardPlayer }

export interface ServerSection {
  server: ServerInfo
  items: DashboardItem[]
  hiddenItems: DashboardItem[]
}

const POLL_INTERVAL_MS = 5000

function toDashboardPlayer({ playerInfo, serverInfo, settings }: PlayerServerInfo, savingHidden?: boolean): DashboardPlayer {
  return {
    id: playerInfo.playerid,
    name: playerInfo.name,
    model: playerInfo.model,
    modelName: playerInfo.modelname,
    ip: playerInfo.ip,
    firmware: playerInfo.firmware,
    imageUrl: `http://${serverInfo.ip}:${serverInfo.jsonPort}/html/images/Players/${playerInfo.model}_250x250.png`,
    hidden: savingHidden ?? settings?.hidden ?? false,
    saving: savingHidden !== undefined
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
      const item: DashboardItem = { kind: 'player', id: player.id, player }
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

  return { sections, stats, loading, error, refresh, setHidden }
}
