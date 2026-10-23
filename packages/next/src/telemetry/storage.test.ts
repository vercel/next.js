import os from 'os'
import path from 'path'
import { retry } from 'next-test-utils'
import { Telemetry } from './storage'

describe('Telemetry', () => {
  let originalFetch: typeof fetch
  let originalTelemetryDisabled: string | undefined
  let originalTelemetryDebug: string | undefined

  beforeEach(() => {
    originalFetch = global.fetch
    originalTelemetryDisabled = process.env.NEXT_TELEMETRY_DISABLED
    originalTelemetryDebug = process.env.NEXT_TELEMETRY_DEBUG
    delete process.env.NEXT_TELEMETRY_DISABLED
    delete process.env.NEXT_TELEMETRY_DEBUG
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalTelemetryDisabled === undefined) {
      delete process.env.NEXT_TELEMETRY_DISABLED
    } else {
      process.env.NEXT_TELEMETRY_DISABLED = originalTelemetryDisabled
    }
    if (originalTelemetryDebug === undefined) {
      delete process.env.NEXT_TELEMETRY_DEBUG
    } else {
      process.env.NEXT_TELEMETRY_DEBUG = originalTelemetryDebug
    }
    jest.restoreAllMocks()
  })

  it('aborts pending telemetry requests when flushing detached', async () => {
    const distDir = path.join(
      os.tmpdir(),
      `next-telemetry-${process.pid}-${Date.now()}`
    )
    const mockFetch = jest.fn(() => new Promise(() => {}))
    global.fetch = mockFetch as typeof fetch
    const childProcess =
      require('child_process') as typeof import('child_process')
    const spawn = jest
      .spyOn(childProcess, 'spawn')
      .mockImplementation(() => ({}) as childProcess.ChildProcess)

    const telemetry = new Telemetry({ distDir })
    ;(telemetry as any).NEXT_TELEMETRY_DISABLED = undefined
    ;(telemetry as any).conf = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        if (key === 'telemetry.enabled') {
          return true
        }
        return defaultValue
      }),
      set: jest.fn(),
    }
    jest.spyOn(telemetry as any, 'getProjectId').mockResolvedValue('project-id')
    telemetry.record({
      eventName: 'NEXT_TEST_EVENT',
      payload: {},
    })

    await retry(() => {
      expect(mockFetch).toHaveBeenCalled()
    })

    const signal = mockFetch.mock.calls[0][1]?.signal as AbortSignal
    expect(signal.aborted).toBe(false)

    telemetry.flushDetached('dev', distDir)

    expect(signal.aborted).toBe(true)
    expect(spawn).toHaveBeenCalled()
  })
})
