import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import axios from 'axios'
import DiscoveredDevices from './DiscoveredDevices.vue'

vi.mock('axios')

const mockPlayers = [
  {
    serverInfo: {
      uuid: 'server-1',
      name: 'Test LMS',
      ip: '192.168.1.2',
      jsonPort: 9000
    },
    playerInfo: {
      playerid: 'player-1',
      name: 'Living Room',
      model: 'squeezebox',
      ip: '192.168.1.10',
      firmware: 'v7.8'
    }
  }
]

describe('DiscoveredDevices', () => {

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows devices if finished loading', async () => {
    (axios.get as any).mockResolvedValue({ data: mockPlayers })
    const wrapper = mount(DiscoveredDevices)
    expect(axios.get).toHaveBeenCalledWith('/api/players')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const serverGroupCards = wrapper.findAll('.server-group-cards')
    expect(serverGroupCards.length).toBeGreaterThan(0)

    const playerCards = wrapper.findAll('.player-card')
    expect(playerCards.length).toBeGreaterThan(0)
  })

  it('show error if loading devices failed', async () => {
    (axios.get as any).mockRejectedValue(new Error('Network Error'))
    const wrapper = mount(DiscoveredDevices)
    expect(axios.get).toHaveBeenCalledWith('/api/players')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    const errorP = wrapper.find('.error')
    expect(errorP.exists()).toBeTruthy()
  })

  it('shows spinner div if loading devices', async () => {
    (axios.get as any).mockResolvedValue({})
    const wrapper = mount(DiscoveredDevices)
    expect(axios.get).toHaveBeenCalledWith('/api/players')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    // Replace '.spinner' with the actual class used for your spinner div
    const spinnerDiv = wrapper.find('.spinner')
    expect(spinnerDiv.exists()).toBeTruthy()
  })
})
