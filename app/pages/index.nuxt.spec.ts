import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IndexPage from './index.vue'

describe('IndexPage', () => {
  it('renders logo image', () => {
    const wrapper = mount(IndexPage)
    const img = wrapper.find('header img')
    expect(img.exists()).toBeTruthy()
    expect(img.attributes('src')).toBe('/logo_512.png')    
  })

  it('renders DiscoveredDevices component', () => {
    const wrapper = mount(IndexPage)
    expect(wrapper.findComponent({ name: 'DiscoveredDevices' }).exists()).toBeTruthy()
  })

  it('renders footer with link', () => {
    const wrapper = mount(IndexPage)
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    const link = footer.find('a')
    expect(link.exists()).toBeTruthy()
    expect(link.attributes('href')).toBe('https://github.com/onmomo/squeeze-plex-hub')    
  })
})
