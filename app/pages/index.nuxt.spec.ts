import { describe, it, expect } from 'vitest'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import IndexPage from './index.vue'
import PlayerDashboard from '../components/PlayerDashboard.vue'

registerEndpoint('/api/players', () => [])

describe('IndexPage', () => {
  it('renders the player dashboard with logo', async () => {
    const wrapper = await mountSuspended(IndexPage)
    expect(wrapper.findComponent(PlayerDashboard).exists()).toBe(true)
    expect(wrapper.find('header img').attributes('src')).toBe('/logo_512.png')
  })

  it('renders footer with link', async () => {
    const wrapper = await mountSuspended(IndexPage)
    const link = wrapper.find('footer a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://github.com/onmomo/squeeze-plex-hub')
  })
})
