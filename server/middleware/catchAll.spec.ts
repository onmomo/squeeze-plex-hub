import { describe, it, vi } from 'vitest'
import eventHandler from '../middleware/catchAll'

vi.mock('~/server/composables/useLogger', () => {
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
