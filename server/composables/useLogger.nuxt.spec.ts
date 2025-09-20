import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import useLogger from './useLogger'
import * as winston from 'winston'

vi.mock('winston', async () => {
  const actual = await vi.importActual<typeof winston>('winston')
  return {
    ...actual,
    createLogger: vi.fn(),
    transports: {
      Console: vi.fn()
    }
  }
})

describe('useLogger', () => {
  const createLoggerMock = winston.createLogger as Mock

  beforeEach(() => {
    vi.clearAllMocks()
    createLoggerMock.mockReturnValue('logger-instance')
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('creates a logger with default service', () => {
    const logger = useLogger()
    expect(createLoggerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        defaultMeta: { service: undefined },
        transports: expect.arrayContaining([expect.anything()])
      })
    )
    expect(logger).toBe('logger-instance')
  })

  it('creates a logger with provided service name', () => {
    const logger = useLogger('my-service')
    expect(createLoggerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultMeta: { service: 'my-service' }
      })
    )
    expect(logger).toBe('logger-instance')
  })

  it('uses logLevel from runtime config and lowercases it', () => {
    useLogger('svc')
    expect(createLoggerMock).toHaveBeenCalledWith(expect.objectContaining({ level: 'info' }))
  })
})
