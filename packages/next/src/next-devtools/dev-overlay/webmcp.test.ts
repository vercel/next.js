import { HMR_MESSAGE_SENT_TO_BROWSER as HMR } from '../../server/dev/hot-reloader-types'
import type { HmrMessageSentToBrowser } from '../../server/dev/hot-reloader-types'

type Tool = { name: string; execute: () => Promise<unknown> }

describe('DevTools WebMCP HMR controls', () => {
  let controls: typeof import('./webmcp')
  let tools: Map<string, Tool>
  let modelContext: {
    registerTool: jest.Mock
    unregisterTool?: jest.Mock
  }
  let received: jest.Mock
  let reload: jest.Mock
  const originalDocument = Object.getOwnPropertyDescriptor(global, 'document')
  const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
  const originalWindow = Object.getOwnPropertyDescriptor(global, 'window')

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    tools = new Map()
    received = jest.fn()
    reload = jest.fn()
    modelContext = {
      registerTool: jest.fn(
        async (tool: Tool, { signal }: { signal: AbortSignal }) => {
          if (tools.has(tool.name)) throw new Error('Duplicate tool')
          tools.set(tool.name, tool)
          signal.addEventListener('abort', () => tools.delete(tool.name))
        }
      ),
    }
    Object.defineProperty(global, 'document', {
      configurable: true,
      value: { modelContext },
    })
    Object.defineProperty(global, 'navigator', {
      configurable: true,
      value: {},
    })
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { reload } },
    })
    controls = require('./webmcp') as typeof import('./webmcp')
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    for (const [key, descriptor] of [
      ['document', originalDocument],
      ['navigator', originalNavigator],
      ['window', originalWindow],
    ] as const) {
      if (descriptor) Object.defineProperty(global, key, descriptor)
      else Reflect.deleteProperty(global, key)
    }
  })

  const message = (type: HMR) =>
    ({
      type,
      errors: [],
      warnings: [],
      hash: 'hash',
      data: [],
    }) as HmrMessageSentToBrowser
  const receive = (msg: HmrMessageSentToBrowser) =>
    controls.dispatchHmrMessage(msg, received)
  const call = (name: string) => tools.get(name)!.execute()

  it('registers once and preserves application tools', async () => {
    tools.set('application_tool', {
      name: 'application_tool',
      execute: jest.fn(),
    })
    await controls.registerHmrTools()
    await controls.registerHmrTools()
    expect([...tools.keys()].sort()).toEqual([
      'application_tool',
      'pause_hmr',
      'resume_hmr',
    ])
    expect(modelContext.registerTool).toHaveBeenCalledTimes(2)
    expect(modelContext.registerTool.mock.calls[0][0].name).toBe('resume_hmr')
  })

  it('supports the legacy navigator API and unsupported browsers', async () => {
    delete (document as any).modelContext
    await controls.registerHmrTools()
    expect(tools.size).toBe(0)
    ;(navigator as any).modelContext = modelContext
    await controls.registerHmrTools()
    expect(tools.size).toBe(2)
  })

  it('prefers the document API', async () => {
    const legacy = jest.fn()
    ;(navigator as any).modelContext = { registerTool: legacy }
    await controls.registerHmrTools()
    expect(legacy).not.toHaveBeenCalled()
    expect(tools.size).toBe(2)
  })

  it('pauses and resumes idempotently without updating an unchanged page', async () => {
    await controls.registerHmrTools()
    await call('resume_hmr')
    await call('pause_hmr')
    await call('pause_hmr')
    await call('resume_hmr')
    await call('resume_hmr')
    jest.runAllTimers()
    expect(received).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    receive(message(HMR.BUILT))
    expect(received).toHaveBeenCalledTimes(1)
  })

  it('waits for an active compilation before acknowledging pause', async () => {
    await controls.registerHmrTools()
    receive(message(HMR.BUILDING))
    const done = jest.fn()
    const pause = call('pause_hmr').then(done)
    // Drain promise callbacks too: otherwise an early acknowledgement can be
    // queued behind this assertion and make the test pass incorrectly.
    await jest.advanceTimersByTimeAsync(20)
    expect(done).not.toHaveBeenCalled()
    receive(message(HMR.BUILT))
    await jest.advanceTimersByTimeAsync(10)
    await pause
    expect(done).toHaveBeenCalledTimes(1)
    expect(received).toHaveBeenCalledTimes(2)
    receive(message(HMR.BUILT))
    expect(received).toHaveBeenCalledTimes(2)
  })

  it('waits for an active module update before acknowledging pause', async () => {
    let idle = false
    await controls.registerHmrTools(() => idle)
    const done = jest.fn()
    const pause = call('pause_hmr').then(done)
    await jest.advanceTimersByTimeAsync(20)
    expect(done).not.toHaveBeenCalled()
    idle = true
    await jest.advanceTimersByTimeAsync(10)
    await pause
    expect(done).toHaveBeenCalledTimes(1)
    receive(message(HMR.BUILT))
    expect(received).not.toHaveBeenCalled()
  })

  it('combines Turbopack deltas and reports only the latest build', async () => {
    await controls.registerHmrTools()
    await call('pause_hmr')
    const first = {
      ...message(HMR.TURBOPACK_MESSAGE),
      data: [{ revision: 1 }],
      hmrVersion: '1',
    } as any
    const last = { ...first, data: [{ revision: 2 }], hmrVersion: '2' }
    receive(message(HMR.BUILDING))
    receive(first)
    receive({
      ...message(HMR.BUILT),
      errors: [{ message: 'intermediate error' }],
    } as any)
    receive(message(HMR.BUILDING))
    receive(last)
    receive(message(HMR.BUILT))
    expect(received).not.toHaveBeenCalled()
    await call('resume_hmr')
    jest.runAllTimers()
    expect(received.mock.calls.map(([msg]) => msg.type)).toEqual([
      HMR.BUILDING,
      HMR.TURBOPACK_MESSAGE,
      HMR.BUILT,
    ])
    expect(received.mock.calls[1][0]).toEqual({
      ...last,
      data: [...first.data, ...last.data],
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('keeps connection handshakes, debug streams and MCP requests working', async () => {
    await controls.registerHmrTools()
    await call('pause_hmr')
    for (const type of [
      HMR.REQUEST_CURRENT_ERROR_STATE,
      HMR.REQUEST_PAGE_METADATA,
      HMR.TURBOPACK_CONNECTED,
      HMR.REACT_DEBUG_CHUNK,
      HMR.DEVTOOLS_CONFIG,
      HMR.REQUEST_INSIGHTS_UPDATE,
    ]) {
      receive(message(type))
    }
    expect(received).toHaveBeenCalledTimes(6)
  })

  it('waits for an active rebuild before flushing the buffered batch', async () => {
    await controls.registerHmrTools()
    await call('pause_hmr')
    receive(message(HMR.BUILT))
    await call('resume_hmr')
    receive(message(HMR.BUILDING))
    jest.runAllTimers()
    expect(received).not.toHaveBeenCalled()
    receive(message(HMR.BUILT))
    jest.runAllTimers()
    expect(received).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([HMR.BUILT, HMR.SYNC])(
    'shows final %s errors and retains module deltas for recovery',
    async (type) => {
      await controls.registerHmrTools()
      await call('pause_hmr')
      const update = message(HMR.TURBOPACK_MESSAGE)
      const error = {
        ...message(type),
        errors: [{ message: 'final error' }],
      } as any
      receive(update)
      receive(error)
      await call('resume_hmr')
      jest.runAllTimers()
      expect(received.mock.calls).toEqual([[error]])
      receive(message(HMR.BUILDING))
      receive(message(HMR.BUILT))
      jest.runAllTimers()
      expect(received.mock.calls.slice(1).map(([msg]) => msg.type)).toEqual([
        HMR.BUILDING,
        HMR.TURBOPACK_MESSAGE,
        HMR.BUILT,
      ])
      expect(reload).not.toHaveBeenCalled()
    }
  )

  it('can pause again before flushing and only reloads for a deferred reload', async () => {
    await controls.registerHmrTools()
    expect(controls.shouldDeferHmrReload()).toBe(false)
    await call('pause_hmr')
    expect(controls.shouldDeferHmrReload()).toBe(true)
    await call('resume_hmr')
    await call('pause_hmr')
    jest.runAllTimers()
    expect(reload).not.toHaveBeenCalled()
    await call('resume_hmr')
    jest.runAllTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it.each(['pause_hmr', 'resume_hmr'])(
    'preserves a conflicting application %s tool',
    async (name) => {
      jest.spyOn(console, 'warn').mockImplementation(() => {})
      const existing = { name, execute: jest.fn() }
      tools.set(name, existing)
      await controls.registerHmrTools()
      expect([...tools.values()]).toEqual([existing])
      receive(message(HMR.BUILT))
      expect(received).toHaveBeenCalledTimes(1)
    }
  )

  it('cleans up a partial registration on the legacy API', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    modelContext.registerTool.mockImplementation((tool: Tool) => {
      if (tools.has(tool.name)) throw new Error('Duplicate tool')
      tools.set(tool.name, tool)
    })
    modelContext.unregisterTool = jest.fn((name: string) => tools.delete(name))
    const existing = { name: 'pause_hmr', execute: jest.fn() }
    tools.set(existing.name, existing)
    await controls.registerHmrTools()
    expect([...tools.values()]).toEqual([existing])
    expect(modelContext.unregisterTool).toHaveBeenCalledWith('resume_hmr')
  })

  it('does not reject if a legacy implementation fails to unregister', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    modelContext.unregisterTool = jest
      .fn()
      .mockRejectedValue(new Error('Unavailable'))
    tools.set('pause_hmr', { name: 'pause_hmr', execute: jest.fn() })
    await expect(controls.registerHmrTools()).resolves.toBeUndefined()
    receive(message(HMR.BUILT))
    expect(received).toHaveBeenCalledTimes(1)
  })
})
