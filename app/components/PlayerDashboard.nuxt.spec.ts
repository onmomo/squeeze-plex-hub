import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import PlayerDashboard from './PlayerDashboard.vue'
import PlayerCard from './PlayerCard.vue'

const server = { uuid: 'server-1', name: 'Lyrion NAS', ip: '192.168.1.20', jsonPort: '9000', ver: '9.0.2', cliPort: '9090' }
const player = (playerid: string, name: string, hidden: boolean) => ({
  playerInfo: { playerid, name, model: 'squeezelite', modelname: 'SqueezeLite', ip: '192.168.1.40', firmware: 'v2' },
  serverInfo: server,
  settings: { hidden }
})

let players: unknown[] = []
let playersStatus = 200
let patchStatus = 200
let patchBodies: unknown[] = []

registerEndpoint('/api/players', () => {
  if (playersStatus !== 200) {
    throw createError({ statusCode: playersStatus })
  }
  return players
})
registerEndpoint('/api/players/aa/settings', {
  method: 'PATCH',
  handler: async (event) => {
    patchBodies.push(await readBody(event))
    if (patchStatus !== 200) {
      throw createError({ statusCode: patchStatus })
    }
    return { hidden: true }
  }
})

async function mountDashboard() {
  const wrapper = await mountSuspended(PlayerDashboard)
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 50))
  await flushPromises()
  return wrapper
}

describe('PlayerDashboard', () => {
  beforeEach(() => {
    players = [player('aa', 'Kitchen', false), player('bb', 'Chromecast', true)]
    playersStatus = 200
    patchStatus = 200
    patchBodies = []
  })

  it('shows servers with visible players and a standby section for hidden ones', async () => {
    const wrapper = await mountDashboard()
    expect(wrapper.text()).toContain('Lyrion NAS')
    expect(wrapper.findAllComponents(PlayerCard)).toHaveLength(1)
    expect(wrapper.text()).toContain('Hidden (1)')
    expect(wrapper.find('.vfd').text()).toContain('01/02')
    wrapper.unmount()
  })

  it('keeps scanning while no players are discovered', async () => {
    playersStatus = 404
    const wrapper = await mountDashboard()
    expect(wrapper.find('.scanning').exists()).toBe(true)
    expect(wrapper.text()).toContain('Scanning for Lyrion servers')
    wrapper.unmount()
  })

  it('shows an error if the hub cannot be reached', async () => {
    playersStatus = 500
    const wrapper = await mountDashboard()
    expect(wrapper.text()).toContain("Can't load players from the hub")
    wrapper.unmount()
  })

  it('hides a player, moves it to the hidden section and offers undo', async () => {
    const wrapper = await mountDashboard()
    wrapper.findComponent(PlayerCard).vm.$emit('update:hidden', true)
    await flushPromises()
    expect(patchBodies).toEqual([{ hidden: true }])
    expect(wrapper.findAllComponents(PlayerCard)).toHaveLength(0)
    expect(wrapper.text()).toContain('Hidden (2)')

    // The confirmation offers to undo the change
    await new Promise((resolve) => setTimeout(resolve, 0))
    const toast = useToast().toasts.value.at(-1)
    expect(toast?.title).toBe('Kitchen hidden')
    const undo = toast?.actions?.find((action) => action.label === 'Undo')
    undo?.onClick?.(new MouseEvent('click'))
    await flushPromises()
    expect(patchBodies).toEqual([{ hidden: true }, { hidden: false }])
    wrapper.unmount()
  })

  it('reverts the change if it cannot be saved', async () => {
    patchStatus = 500
    const wrapper = await mountDashboard()
    wrapper.findComponent(PlayerCard).vm.$emit('update:hidden', true)
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(wrapper.findAllComponents(PlayerCard)).toHaveLength(1)
    expect(wrapper.text()).toContain('Hidden (1)')
    wrapper.unmount()
  })
})
