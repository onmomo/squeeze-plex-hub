import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PlayerCard from './PlayerCard.vue'
import type { DashboardPlayer } from '../composables/usePlayerDashboard'

const player: DashboardPlayer = {
  id: '00:04:20:2a:11:02',
  name: 'Kitchen',
  model: 'baby',
  modelName: 'Squeezebox Radio',
  ip: '192.168.1.42',
  firmware: '8.0.1',
  imageUrl: 'http://192.168.1.20:9000/html/images/Players/baby_250x250.png',
  hidden: false,
  saving: false,
  canPair: true
}

describe('PlayerCard', () => {
  it('shows player details', async () => {
    const wrapper = await mountSuspended(PlayerCard, { props: { player } })
    expect(wrapper.text()).toContain('Kitchen')
    expect(wrapper.text()).toContain('Squeezebox Radio')
    expect(wrapper.text()).toContain('192.168.1.42')
    expect(wrapper.text()).toContain('In Plexamp')
    expect(wrapper.find('.channel-state').exists()).toBe(false)
    expect(wrapper.find('img').attributes('src')).toBe(player.imageUrl)
  })

  it('falls back to an icon if the model image is missing', async () => {
    const wrapper = await mountSuspended(PlayerCard, { props: { player } })
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('shows standby for hidden players', async () => {
    const wrapper = await mountSuspended(PlayerCard, { props: { player: { ...player, hidden: true } } })
    expect(wrapper.find('.channel').classes()).toContain('is-standby')
    expect(wrapper.find('.channel-state').text()).toBe('Hidden')
    expect(wrapper.find('button[role="switch"]').text()).toBe('Show in Plexamp')
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('emits update:hidden when the switch is toggled', async () => {
    const wrapper = await mountSuspended(PlayerCard, { props: { player } })
    expect(wrapper.find('button[role="switch"]').attributes('aria-checked')).toBe('true')
    await wrapper.find('button[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:hidden')).toEqual([[true]])
  })

  it('marks a stereo pair with the amber border and shows both players', async () => {
    const pair = { leftName: 'Kitchen L', right: { ...player, name: 'Kitchen R' } }
    const wrapper = await mountSuspended(PlayerCard, { props: { player: { ...player, name: 'Kitchen ⇄' }, pair } })
    expect(wrapper.find('.channel').classes()).toContain('is-pair')
    expect(wrapper.text()).toContain('Stereo pair')
    expect(wrapper.find('.main-star').exists()).toBe(true)
    expect(wrapper.findAll('.main-star')).toHaveLength(1)
    const single = await mountSuspended(PlayerCard, { props: { player } })
    expect(single.find('.channel').classes()).not.toContain('is-pair')
  })
})
