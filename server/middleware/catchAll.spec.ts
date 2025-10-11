import { describe, it, vi } from 'vitest'
import eventHandler from './catchAll'

vi.mock('../composables/useLogger', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      debug: vi.fn()
    }))
  }
})

describe('catchAll middleware', () => {
  it('logs the request method and path', async () => {
    const event = { method: 'GET', path: '/test' }
    await eventHandler(event as any)
  })
})
