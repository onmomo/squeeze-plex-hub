<script setup lang="ts">
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DiscoveredDevices from './DiscoveredDevices.vue'
import axios from 'axios'

vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}))

const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function makePlayer(
  serverUuid: string,
  serverName: string,
  serverIp: string,
  jsonPort: number,
  playerId: string,
  playerName: string,
  model: string,
  playerIp: string,
  firmware: string
) {
  return {
    serverInfo: {
      uuid: serverUuid,
      name: serverName,
      ip: serverIp,
      jsonPort
    },
    playerInfo: {
      playerid: playerId,
      name: playerName,
      model,
      ip: playerIp,
      firmware
    }
  }
}

describe('DiscoveredDevices.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(axios.get as any).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows loading spinner initially and stays loading on 404', async () => {
    ;(axios.get as any).mockRejectedValueOnce({ response: { status: 404 } })
    const wrapper = mount(DiscoveredDevices)
    await flush()
    expect(wrapper.find('.loading .spinner').exists()).toBe(true)    
    expect(wrapper.find('.error').exists()).toBe(false)
  })

  it('renders grouped players with correct headings and cards on success', async () => {
    const data = [
      makePlayer('srv1', 'Home LMS', '192.168.1.10', 9000, 'p1', 'Living Room', 'squeezebox3', '192.168.1.11', '8.3'),
      makePlayer('srv1', 'Home LMS', '192.168.1.10', 9000, 'p2', 'Kitchen', 'squeezebox2', '192.168.1.12', '8.3'),
      makePlayer('srv2', 'Office LMS', '10.0.0.5', 9000, 'p3', 'Office', 'boom', '10.0.0.6', '7.9')
    ]
    ;(axios.get as any).mockResolvedValueOnce({ data })
    const wrapper = mount(DiscoveredDevices)
    await flush()

    const groups = wrapper.findAll('.server-group')
    expect(groups.length).toBe(2)

    const firstHeading = groups[0].find('h2').text()
    expect(firstHeading).toContain('2 player(s) found')

    expect(groups[0].findAll('.player-card').length).toBe(2)

    const img = groups[0].findAll('img.player-image')[0]
    expect((img.element as HTMLImageElement).src).toContain('http://192.168.1.10:9000/html/images/Players/squeezebox3_250x250.png')

    expect(groups[0].text()).toContain('Living Room')
    expect(groups[0].text()).toContain('📶 192.168.1.11')
    expect(groups[0].text()).toContain('⚙️ 8.3')
  })

  it('transitions from loading to success via polling', async () => {
    ;(axios.get as any)
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: [makePlayer('srv1', 'LMS', '1.1.1.1', 9000, 'p1', 'LR', 'boom', '1.1.1.2', '8.0')] })

    const wrapper = mount(DiscoveredDevices)
    await flush()
    expect(wrapper.find('.loading').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    await flush()

    expect(wrapper.find('.loading').exists()).toBe(false)
    expect(wrapper.findAll('.player-card').length).toBe(1)
    expect((axios.get as any).mock.calls.length).toBe(2)
  })

  it('shows error state on non-axios error', async () => {
    ;(axios.get as any).mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(DiscoveredDevices)
    await flush()
    expect(wrapper.find('.error').exists()).toBe(true)    
  })

})
</script>

<template />