import { HMR_MESSAGE_SENT_TO_BROWSER } from '../../../../server/dev/hot-reloader-types'
import type { HmrMessageSentToBrowser } from '../../../../server/dev/hot-reloader-types'

const mockCreateFromReadableStream = jest.fn()

jest.mock('react-server-dom-webpack/client', () => ({
  createFromReadableStream: (...args: unknown[]) =>
    mockCreateFromReadableStream(...args),
}))

jest.mock('next/dist/compiled/next-devtools', () => ({
  dispatcher: new Proxy({}, { get: () => () => {} }),
  getSerializedOverlayState: jest.fn(),
  getSegmentTrieData: jest.fn(),
}))

jest.mock('../../report-hmr-latency', () => jest.fn())

jest.mock('../../../components/app-router-instance', () => ({
  publicAppRouterInstance: { hmrRefresh: jest.fn() },
}))

// Resolves on the next macrotask, after all pending microtasks have run.
function waitForPendingMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

describe('processMessage - ERRORS_TO_SHOW_IN_BROWSER', () => {
  const originalEnv = process.env
  const hadSelf = 'self' in globalThis
  let consoleErrorSpy: jest.SpyInstance

  beforeAll(() => {
    // The HMR client reads debugging flags from `self`.
    if (!hadSelf) {
      ;(globalThis as any).self = globalThis
    }
  })

  afterAll(() => {
    if (!hadSelf) {
      delete (globalThis as any).self
    }
  })

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    mockCreateFromReadableStream.mockReset()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
    jest.clearAllTimers()
    jest.useRealTimers()
    delete (globalThis as any).__webpack_hash__
  })

  function load() {
    return require('./hot-reloader-app') as typeof import('./hot-reloader-app')
  }

  function send(
    processMessage: ReturnType<typeof load>['processMessage'],
    message: HmrMessageSentToBrowser
  ) {
    processMessage(message, () => {}, jest.fn(), {
      pathname: null,
      appIsrManifest: null,
    })
  }

  const errorsMessage: HmrMessageSentToBrowser = {
    type: HMR_MESSAGE_SENT_TO_BROWSER.ERRORS_TO_SHOW_IN_BROWSER,
    serializedErrors: new Uint8Array(),
  }

  it('waits for the pending webpack hot update before reporting server errors', async () => {
    delete process.env.TURBOPACK
    const { processMessage } = load()
    const serverError = new Error('Route "/target": instant validation error')
    mockCreateFromReadableStream.mockResolvedValue({ errors: [serverError] })

    // A rebuild starts (e.g. on-demand compilation of a navigation target)...
    send(processMessage, { type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING })
    // ...and the server reports errors before the hot update is applied.
    send(processMessage, errorsMessage)
    await waitForPendingMicrotasks()

    // Reporting now would let the upcoming Fast Refresh clear the error.
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(serverError)

    // The build finishes and there is nothing left to apply, which resolves
    // the pending hot update.
    ;(globalThis as any).__webpack_hash__ = 'hash-1'
    send(processMessage, {
      type: HMR_MESSAGE_SENT_TO_BROWSER.BUILT,
      hash: 'hash-1',
      errors: [],
      warnings: [],
    })
    await waitForPendingMicrotasks()

    expect(consoleErrorSpy).toHaveBeenCalledWith(serverError)
  })

  it('reports server errors immediately when no rebuild is pending', async () => {
    delete process.env.TURBOPACK
    const { processMessage } = load()
    const serverError = new Error('Route "/target": instant validation error')
    mockCreateFromReadableStream.mockResolvedValue({ errors: [serverError] })

    send(processMessage, errorsMessage)
    await waitForPendingMicrotasks()

    expect(consoleErrorSpy).toHaveBeenCalledWith(serverError)
  })

  it('does not wait for a webpack hot update with Turbopack', async () => {
    // Turbopack's BUILDING handler schedules a delayed HMR latency report.
    // Keep it from outliving the test.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask'] })
    process.env.TURBOPACK = '1'
    const { processMessage } = load()
    const serverError = new Error('Route "/target": instant validation error')
    mockCreateFromReadableStream.mockResolvedValue({ errors: [serverError] })

    send(processMessage, { type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING })
    send(processMessage, errorsMessage)
    await waitForPendingMicrotasks()

    expect(consoleErrorSpy).toHaveBeenCalledWith(serverError)
  })
})
