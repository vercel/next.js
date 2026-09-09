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
  let reload: jest.Mock
  const originalDocument = Object.getOwnPropertyDescriptor(global, 'document')
  const originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
  const originalWindow = Object.getOwnPropertyDescriptor(global, 'window')

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    tools = new Map()
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

  const message = (type: HMR) => ({ type }) as HmrMessageSentToBrowser
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

  it('pauses and resumes idempotently without reloading an unchanged page', async () => {
    await controls.registerHmrTools()
    await call('resume_hmr')
    await call('pause_hmr')
    await call('pause_hmr')
    await call('resume_hmr')
    await call('resume_hmr')
    jest.runAllTimers()
    expect(reload).not.toHaveBeenCalled()
    expect(controls.shouldDeferHmrMessage(message(HMR.BUILT))).toBe(false)
  })

  it('drops intermediate edits and schedules one reload on resume', async () => {
    await controls.registerHmrTools()
    await call('pause_hmr')
    for (const type of [
      HMR.BUILDING,
      HMR.BUILT,
      HMR.TURBOPACK_MESSAGE,
      HMR.SERVER_ERROR,
      HMR.ERRORS_TO_SHOW_IN_BROWSER,
      HMR.SERVER_COMPONENT_CHANGES,
      HMR.RELOAD_PAGE,
    ]) {
      expect(controls.shouldDeferHmrMessage(message(type))).toBe(true)
    }
    await call('resume_hmr')
    await call('resume_hmr')
    expect(reload).not.toHaveBeenCalled()
    expect(controls.shouldDeferHmrMessage(message(HMR.BUILT))).toBe(true)
    jest.runAllTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('keeps MCP requests, connection handshakes and debug streams working', async () => {
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
      expect(controls.shouldDeferHmrMessage(message(type))).toBe(false)
    }
    await call('resume_hmr')
    jest.runAllTimers()
    expect(reload).not.toHaveBeenCalled()
  })

  it('waits for compilation and coalesces late updates before reloading', async () => {
    await controls.registerHmrTools()
    await call('pause_hmr')
    controls.shouldDeferHmrMessage(message(HMR.BUILT))
    await call('resume_hmr')
    // The watcher can report the final edit after resume has been called.
    controls.shouldDeferHmrMessage(message(HMR.BUILDING))
    jest.runAllTimers()
    expect(reload).not.toHaveBeenCalled()
    controls.shouldDeferHmrMessage(message(HMR.BUILT))
    jest.advanceTimersByTime(50)
    controls.shouldDeferHmrMessage(message(HMR.SERVER_COMPONENT_CHANGES))
    jest.advanceTimersByTime(50)
    expect(reload).not.toHaveBeenCalled()
    jest.runAllTimers()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('defers disconnect reloads and can pause again before navigation', async () => {
    await controls.registerHmrTools()
    expect(controls.shouldDeferHmrReload()).toBe(false)
    await call('pause_hmr')
    controls.shouldDeferHmrMessage(message(HMR.BUILDING))
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
      expect(controls.shouldDeferHmrMessage(message(HMR.BUILT))).toBe(false)
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
    expect(controls.shouldDeferHmrMessage(message(HMR.BUILT))).toBe(false)
  })
})
