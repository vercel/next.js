import { HMR_MESSAGE_SENT_TO_BROWSER as HMR } from '../../server/dev/hot-reloader-types'
import type { HmrMessageSentToBrowser } from '../../server/dev/hot-reloader-types'

type Tool = { name: string; execute: () => Promise<any> }

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
  const originalAnimationFrame = Object.getOwnPropertyDescriptor(
    global,
    'requestAnimationFrame'
  )
  const originalCancelAnimationFrame = Object.getOwnPropertyDescriptor(
    global,
    'cancelAnimationFrame'
  )

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
    controls.setHmrConnection(true)
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    for (const [key, descriptor] of [
      ['document', originalDocument],
      ['navigator', originalNavigator],
      ['window', originalWindow],
      ['requestAnimationFrame', originalAnimationFrame],
      ['cancelAnimationFrame', originalCancelAnimationFrame],
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
  const settledCall = async (name: string) => {
    const completion = call(name)
    await jest.advanceTimersByTimeAsync(150)
    return completion
  }

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
    await settledCall('resume_hmr')
    await settledCall('pause_hmr')
    await settledCall('pause_hmr')
    await settledCall('resume_hmr')
    await settledCall('resume_hmr')
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
    await settledCall('pause_hmr')
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
    await settledCall('resume_hmr')
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
    await settledCall('pause_hmr')
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
    await settledCall('pause_hmr')
    receive(message(HMR.BUILT))
    const done = jest.fn()
    const resume = call('resume_hmr').then(done)
    await Promise.resolve()
    receive(message(HMR.BUILDING))
    await jest.advanceTimersByTimeAsync(150)
    expect(received).not.toHaveBeenCalled()
    expect(done).not.toHaveBeenCalled()
    receive(message(HMR.BUILT))
    await jest.advanceTimersByTimeAsync(150)
    await resume
    expect(received).toHaveBeenCalledTimes(2)
    expect(reload).not.toHaveBeenCalled()
  })

  it.each([HMR.BUILT, HMR.SYNC])(
    'shows final %s errors and retains module deltas for recovery',
    async (type) => {
      await controls.registerHmrTools()
      await settledCall('pause_hmr')
      const update = message(HMR.TURBOPACK_MESSAGE)
      const error = {
        ...message(type),
        errors: [{ message: 'final error' }],
      } as any
      receive(update)
      receive(error)
      await settledCall('resume_hmr')
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

  it('reports a required reload without claiming the new document is ready', async () => {
    await controls.registerHmrTools()
    expect(controls.shouldDeferHmrReload()).toBe(false)
    await settledCall('pause_hmr')
    expect(controls.shouldDeferHmrReload()).toBe(true)
    const resumed = await call('resume_hmr')
    expect(resumed.structuredContent).toMatchObject({
      outcome: 'reload-required',
      updatesApplied: false,
      reload: 'scheduled',
    })
    expect(reload).not.toHaveBeenCalled()
    await call('pause_hmr')
    await jest.advanceTimersByTimeAsync(150)
    expect(reload).not.toHaveBeenCalled()
    await call('resume_hmr')
    await jest.advanceTimersByTimeAsync(150)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(controls.getHmrStatus().pageStatus).toBe('unknown')
  })

  it('waits for module promises and the router commit before acknowledging resume', async () => {
    await controls.registerHmrTools()
    receive(message(HMR.SYNC))
    await settledCall('pause_hmr')
    let finishUpdate!: () => void
    received.mockImplementation((msg) => {
      if (msg.type === HMR.TURBOPACK_MESSAGE) {
        controls.trackHmrUpdate(
          new Promise<void>((resolve) => {
            finishUpdate = resolve
          })
        )
        controls.setHmrRendering(true)
      }
    })
    receive(message(HMR.TURBOPACK_MESSAGE))
    receive(message(HMR.BUILT))
    expect(controls.getHmrStatus()).toMatchObject({
      hmrState: 'paused',
      pendingUpdates: 1,
      pageStatus: 'stale',
    })
    const done = jest.fn()
    const resume = call('resume_hmr').then(done)
    await jest.advanceTimersByTimeAsync(150)
    expect(done).not.toHaveBeenCalled()
    expect(controls.getHmrStatus()).toMatchObject({
      hmrState: 'applying',
      pageStatus: 'updating',
    })
    finishUpdate()
    await jest.advanceTimersByTimeAsync(50)
    expect(done).not.toHaveBeenCalled()
    controls.setHmrRendering(false)
    await jest.advanceTimersByTimeAsync(50)
    await resume
    expect(done.mock.calls[0][0].structuredContent).toMatchObject({
      outcome: 'applied',
      updatesApplied: true,
      status: {
        hmrState: 'idle',
        pendingUpdates: 0,
        compilationState: 'ready',
        pageStatus: 'current',
      },
    })
  })

  it('returns a prompt no-op without inventing compilation freshness', async () => {
    await controls.registerHmrTools()
    const completion = call('resume_hmr')
    await jest.advanceTimersByTimeAsync(10)
    expect((await completion).structuredContent).toMatchObject({
      outcome: 'no-op',
      updatesApplied: false,
      status: { compilationState: 'unknown', pageStatus: 'unknown' },
    })
  })

  it('shares concurrent resumes and delivers a buffered update once', async () => {
    await controls.registerHmrTools()
    await settledCall('pause_hmr')
    receive(message(HMR.TURBOPACK_MESSAGE))
    receive(message(HMR.BUILT))
    const first = call('resume_hmr')
    const second = call('resume_hmr')
    await jest.advanceTimersByTimeAsync(150)
    expect(await first).toEqual(await second)
    expect((await first).structuredContent.outcome).toBe('applied')
    expect(
      received.mock.calls.filter(([msg]) => msg.type === HMR.TURBOPACK_MESSAGE)
    ).toHaveLength(1)
  })

  it('returns compilation diagnostics when blocked and retains deltas for repair', async () => {
    await controls.registerHmrTools()
    await settledCall('pause_hmr')
    receive(message(HMR.TURBOPACK_MESSAGE))
    receive({
      ...message(HMR.BUILT),
      errors: [{ message: 'Unexpected token', moduleName: './app/page.tsx' }],
    } as any)
    const blocked = await settledCall('resume_hmr')
    expect(blocked).toMatchObject({
      isError: true,
      structuredContent: {
        outcome: 'blocked',
        updatesApplied: false,
        errors: [{ message: 'Unexpected token', moduleName: './app/page.tsx' }],
        status: {
          hmrState: 'idle',
          pendingUpdates: 1,
          compilationState: 'error',
          pageStatus: 'stale',
        },
      },
    })
    expect(controls.getHmrStatus()).toMatchObject({
      hmrState: 'idle',
      compilationState: 'error',
      pageStatus: 'stale',
    })
    receive(message(HMR.BUILDING))
    receive(message(HMR.BUILT))
    expect((await settledCall('resume_hmr')).structuredContent).toMatchObject({
      outcome: 'applied',
      errors: [],
    })
  })

  it('reports a stable blocked status after an error-only batch with no pending updates', async () => {
    await controls.registerHmrTools()
    await settledCall('pause_hmr')
    receive({
      ...message(HMR.BUILT),
      errors: [{ message: 'Compilation failed' }],
    } as any)
    const blocked = await settledCall('resume_hmr')
    expect(blocked.structuredContent).toMatchObject({
      outcome: 'blocked',
      status: {
        hmrState: 'idle',
        pendingUpdates: 0,
        compilationState: 'error',
        pageStatus: 'stale',
      },
    })
    await jest.advanceTimersByTimeAsync(1000)
    expect(controls.getHmrStatus()).toMatchObject({
      hmrState: 'idle',
      pendingUpdates: 0,
      compilationState: 'error',
      pageStatus: 'stale',
      lastUpdate: { outcome: 'blocked' },
      errors: [{ message: 'Compilation failed' }],
    })
  })

  it('settles with suspended animation frames only after runtime and render work completes', async () => {
    const animationFrame = jest.fn(() => 1)
    const cancelAnimationFrame = jest.fn()
    Object.defineProperty(global, 'requestAnimationFrame', {
      configurable: true,
      value: animationFrame,
    })
    Object.defineProperty(global, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrame,
    })
    await controls.registerHmrTools()
    receive(message(HMR.SYNC))
    await settledCall('pause_hmr')
    let finishUpdate!: () => void
    received.mockImplementation((msg) => {
      if (msg.type === HMR.TURBOPACK_MESSAGE) {
        controls.trackHmrUpdate(
          new Promise<void>((resolve) => {
            finishUpdate = resolve
          })
        )
        controls.setHmrRendering(true)
      }
    })
    receive(message(HMR.TURBOPACK_MESSAGE))
    receive(message(HMR.BUILT))
    const done = jest.fn()
    const completion = call('resume_hmr').then(done)
    await jest.advanceTimersByTimeAsync(500)
    expect(done).not.toHaveBeenCalled()
    finishUpdate()
    await jest.advanceTimersByTimeAsync(500)
    expect(done).not.toHaveBeenCalled()
    controls.setHmrRendering(false)
    await jest.advanceTimersByTimeAsync(110)
    await completion
    expect(done.mock.calls[0][0].structuredContent).toMatchObject({
      outcome: 'applied',
      updatesApplied: true,
      status: { hmrState: 'idle', pageStatus: 'current', pendingUpdates: 0 },
    })
    expect(animationFrame).toHaveBeenCalled()
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('reports runtime update rejection without leaving resume unresolved', async () => {
    await controls.registerHmrTools()
    await settledCall('pause_hmr')
    received.mockImplementation(() =>
      controls.trackHmrUpdate(Promise.reject(new Error('Refresh failed')))
    )
    receive(message(HMR.TURBOPACK_MESSAGE))
    expect((await settledCall('resume_hmr')).structuredContent).toMatchObject({
      outcome: 'blocked',
      errors: [{ message: 'Refresh failed' }],
    })
  })

  it('reports committed render errors and observes their repair through the live getter', async () => {
    await controls.registerHmrTools()
    let renderErrors: { message: string }[] = []
    const detach = controls.setHmrErrorGetter(() => renderErrors)
    await settledCall('pause_hmr')
    received.mockImplementation(() => {
      renderErrors = [{ message: 'Component render failed' }]
    })
    receive(message(HMR.TURBOPACK_MESSAGE))
    receive(message(HMR.BUILT))
    expect(await settledCall('resume_hmr')).toMatchObject({
      isError: true,
      structuredContent: {
        outcome: 'blocked',
        errors: [{ message: 'Component render failed' }],
        status: { hmrState: 'idle', pageStatus: 'stale' },
      },
    })
    // Pausing to repair an errored component must still work.
    expect((await settledCall('pause_hmr')).structuredContent.outcome).toBe(
      'paused'
    )
    received.mockImplementation(() => {
      renderErrors = []
    })
    receive(message(HMR.BUILDING))
    receive(message(HMR.TURBOPACK_MESSAGE))
    receive(message(HMR.BUILT))
    expect((await settledCall('resume_hmr')).structuredContent).toMatchObject({
      outcome: 'applied',
      errors: [],
    })
    detach()
  })

  it('keeps a replacement error getter when the old registration is disposed', async () => {
    const detach = controls.setHmrErrorGetter(() => [{ message: 'Old error' }])
    controls.setHmrErrorGetter(() => [{ message: 'Current error' }])
    detach()
    expect(controls.getHmrStatus().errors).toEqual([
      { message: 'Current error' },
    ])
  })

  it('preserves reload causes without turning null into an error', async () => {
    await controls.registerHmrTools()
    controls.reportHmrReload(null)
    expect((await call('resume_hmr')).structuredContent.errors).toEqual([])
    controls.reportHmrReload(new Error('Refresh requires reload'))
    expect((await call('resume_hmr')).structuredContent).toMatchObject({
      outcome: 'reload-required',
      errors: [{ message: 'Refresh requires reload' }],
    })
  })

  it('bounds completion waits and never reports a disconnected page as current', async () => {
    await controls.registerHmrTools()
    controls.setHmrRendering(true)
    const completion = call('resume_hmr')
    await jest.advanceTimersByTimeAsync(30_010)
    expect(await completion).toMatchObject({
      isError: true,
      structuredContent: { outcome: 'timeout', updatesApplied: false },
    })
    controls.setHmrRendering(false)
    controls.setHmrConnection(false)
    expect((await settledCall('resume_hmr')).structuredContent).toMatchObject({
      outcome: 'blocked',
      status: { hmrState: 'unavailable', pageStatus: 'unknown' },
    })
  })

  it('does not count metadata or debugging messages as applied updates', async () => {
    await controls.registerHmrTools()
    receive(message(HMR.SYNC))
    await jest.advanceTimersByTimeAsync(10)
    const before = controls.getHmrStatus()
    receive(message(HMR.REACT_DEBUG_CHUNK))
    receive(message(HMR.REQUEST_INSIGHTS_UPDATE))
    expect(controls.getHmrStatus()).toEqual(before)
    expect((await settledCall('resume_hmr')).structuredContent.outcome).toBe(
      'no-op'
    )
  })

  it('reports HMR unavailable when its controls have not registered', () => {
    expect(controls.getHmrStatus()).toMatchObject({
      hmrState: 'unavailable',
      pageStatus: 'unknown',
    })
  })

  it.each(['pause_hmr', 'resume_hmr'])(
    'preserves a conflicting application %s tool',
    async (name) => {
      jest.spyOn(console, 'warn').mockImplementation(() => {})
      const existing = { name, execute: jest.fn() }
      tools.set(name, existing)
      await controls.registerHmrTools()
      expect([...tools.values()]).toEqual([existing])
      expect(controls.getHmrStatus().hmrState).toBe('unavailable')
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
