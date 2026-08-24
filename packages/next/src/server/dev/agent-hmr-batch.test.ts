import type { HmrMessageSentToBrowser } from './hot-reloader-types'
import { HMR_MESSAGE_SENT_TO_BROWSER } from './hot-reloader-types'
import {
  AgentHmrBatchController,
  MAX_QUEUED_MESSAGES,
  getBatchDisposition,
} from './agent-hmr-batch'

const built = (
  errors: Array<{ message: string }> = [],
  warnings: Array<{ message: string }> = []
): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.BUILT,
  hash: 'hash',
  errors,
  warnings,
})

const building = (): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING,
})

const serverComponentChanges = (): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
})

const turbopackUpdate = (): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE,
  data: [],
})

const reloadPage = (): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE,
  data: '/',
})

const turbopackConnected = (): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED,
  data: { sessionId: 1 },
})

const serverError = (message: string): HmrMessageSentToBrowser => ({
  type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR,
  errorJSON: JSON.stringify({ message, stack: `${message}\n  at <anonymous>` }),
})

/**
 * A controller with fully controlled time and timers, plus a recording
 * "browser" so tests can assert on exactly what was delivered and when.
 */
function setup({ enabled = true }: { enabled?: boolean } = {}) {
  let currentTime = 1_000
  const timers = new Map<number, { fn: () => void; at: number }>()
  let nextTimerId = 1
  const delivered: string[] = []
  const warnings: string[] = []
  let compiling = false

  const controller = new AgentHmrBatchController({
    now: () => currentTime,
    isCompiling: () => compiling,
    logger: {
      warn: (message: string) => {
        warnings.push(message)
      },
    },
    setTimer: (fn, ms) => {
      const id = nextTimerId++
      timers.set(id, { fn, at: currentTime + ms })
      return id
    },
    clearTimer: (handle) => {
      timers.delete(handle as number)
    },
  })

  controller.configure({ enabled })

  /**
   * Pushes a message through the gate the way a hot reloader does: deliver it
   * unless the controller took it over.
   */
  function send(message: HmrMessageSentToBrowser, label: string) {
    const held = controller.intercept(message, () => {
      delivered.push(label)
    })
    if (!held) {
      delivered.push(label)
    }
    return held
  }

  function advance(ms: number) {
    currentTime += ms
    for (const [id, timer] of [...timers]) {
      if (timer.at <= currentTime) {
        timers.delete(id)
        timer.fn()
      }
    }
  }

  // Every unit test drives compilation explicitly, so settling has nothing to
  // wait for. The settle path has its own test below.
  const end = () => controller.end({ settle: false })

  return {
    controller,
    send,
    end,
    advance,
    delivered,
    warnings,
    setCompiling: (value: boolean) => {
      compiling = value
    },
  }
}

describe('getBatchDisposition', () => {
  it('holds messages that change what the browser renders', () => {
    expect(
      getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE)
    ).toBe('hold')
    expect(getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.BUILT)).toBe('hold')
    expect(getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE)).toBe(
      'hold'
    )
    expect(
      getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES)
    ).toBe('hold')
    expect(getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR)).toBe(
      'hold'
    )
  })

  it('drops the transient compiling indicator', () => {
    expect(getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.BUILDING)).toBe(
      'drop'
    )
  })

  it('passes messages unrelated to the rendered output', () => {
    expect(
      getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED)
    ).toBe('pass')
    expect(
      getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.CACHE_INDICATOR)
    ).toBe('pass')
    expect(
      getBatchDisposition(HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_PAGE_METADATA)
    ).toBe('pass')
  })
})

describe('AgentHmrBatchController', () => {
  it('is inert when no batch is open', () => {
    const { send, delivered } = setup()

    send(turbopackUpdate(), 'update')
    send(built(), 'built')

    expect(delivered).toEqual(['update', 'built'])
  })

  it('refuses to open a batch unless the feature is enabled', () => {
    const { controller, send, delivered } = setup({ enabled: false })

    expect(controller.begin()).toMatchObject({
      status: 'disabled',
      batchId: null,
    })
    expect(controller.isHolding()).toBe(false)

    send(turbopackUpdate(), 'update')
    expect(delivered).toEqual(['update'])
  })

  it('holds browser-visible updates while a batch is open', () => {
    const { controller, send, delivered } = setup()

    expect(controller.begin()).toMatchObject({ status: 'opened' })

    expect(send(turbopackUpdate(), 'update-1')).toBe(true)
    expect(send(built(), 'built')).toBe(true)
    expect(delivered).toEqual([])
    expect(controller.isHolding()).toBe(true)
  })

  it('lets through messages that do not affect the rendered output', () => {
    const { controller, send, delivered } = setup()
    controller.begin()

    expect(send(turbopackConnected(), 'connected')).toBe(false)
    expect(delivered).toEqual(['connected'])
  })

  it('never replays the transient compiling indicator', async () => {
    const { controller, send, end, delivered } = setup()
    controller.begin()

    send(building(), 'building')
    send(built(), 'built')

    const result = await end()

    expect(result.droppedMessageCount).toBe(1)
    expect(delivered).toEqual(['built'])
  })

  it('flushes a clean batch as one coalesced burst', async () => {
    const { controller, send, end, delivered } = setup()
    controller.begin()

    // Three edit/compile cycles, the shape of a multi-step agent edit.
    for (let step = 1; step <= 3; step++) {
      send(building(), `building-${step}`)
      send(turbopackUpdate(), `update-${step}`)
      send(serverComponentChanges(), `rsc-${step}`)
      send(built(), `built-${step}`)
    }

    expect(delivered).toEqual([])

    const result = await end()

    expect(result.status).toBe('flushed')
    expect(result.compiled).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.previewPreserved).toBe(true)

    // Every module update is applied, in order, because they are incremental
    // patches. The "refetch" and "compiled" signals collapse to one each, the
    // last payload wins, and coalescing moves them behind the updates they
    // now describe.
    expect(delivered).toEqual([
      'update-1',
      'update-2',
      'update-3',
      'rsc-3',
      'built-3',
    ])
  })

  it('withholds the flush and returns the errors when the batch ends broken', async () => {
    const { controller, send, end, delivered } = setup()
    controller.begin()

    send(turbopackUpdate(), 'update')
    send(built([{ message: 'Module not found: ./missing' }]), 'built-broken')

    const result = await end()

    expect(result.status).toBe('withheld')
    expect(result.compiled).toBe(true)
    expect(result.errors).toEqual([{ message: 'Module not found: ./missing' }])
    // The browser is still on the last state that compiled.
    expect(delivered).toEqual([])
  })

  it('releases a withheld queue on the next clean compile', async () => {
    const { controller, send, end, delivered } = setup()
    controller.begin()
    send(turbopackUpdate(), 'update-1')
    send(built([{ message: 'Unexpected token' }]), 'built-broken')

    expect((await end()).status).toBe('withheld')
    expect(delivered).toEqual([])

    // The agent fixes the syntax error outside of a batch.
    send(built(), 'built-fixed')

    expect(delivered).toEqual(['update-1', 'built-fixed'])
  })

  it('keeps withholding while the compilation is still broken', async () => {
    const { controller, send, end, delivered } = setup()
    controller.begin()
    send(turbopackUpdate(), 'update-1')
    send(built([{ message: 'Unexpected token' }]), 'built-broken')
    await end()

    // A second, still-failing compile must not push the intermediate update.
    send(built([{ message: 'Unexpected token' }]), 'built-still-broken')

    expect(delivered).toEqual(['built-still-broken'])

    send(built(), 'built-fixed')
    expect(delivered).toEqual(['built-still-broken', 'update-1', 'built-fixed'])
  })

  it('reports HMR server errors to the agent instead of the overlay', async () => {
    const { controller, send, end, delivered } = setup()
    controller.begin()

    send(serverError('boom'), 'server-error')

    const result = await end()

    expect(result.status).toBe('withheld')
    expect(result.errors).toEqual([
      { message: 'boom', stack: expect.stringContaining('boom') },
    ])
    expect(delivered).toEqual([])
  })

  it('reports an unparseable server error payload verbatim', async () => {
    const { controller, end } = setup()
    controller.begin()

    controller.intercept(
      {
        type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_ERROR,
        errorJSON: 'not json',
      },
      () => {}
    )

    expect((await end()).errors).toEqual([{ message: 'not json' }])
  })

  it('distinguishes "compiled cleanly" from "never compiled"', async () => {
    const { controller, end } = setup()
    controller.begin()

    const result = await end()

    expect(result.status).toBe('flushed')
    expect(result.errors).toEqual([])
    // No compile result was observed, so the empty error list is the absence of
    // evidence rather than a clean build.
    expect(result.compiled).toBe(false)
  })

  it('does not nest batches', async () => {
    const { controller, send, end, delivered } = setup()

    const first = controller.begin()
    send(turbopackUpdate(), 'update-1')

    const second = controller.begin()
    expect(second).toMatchObject({
      status: 'already-open',
      batchId: first.batchId,
    })

    // The outer batch's queue survives the redundant `begin`.
    send(built(), 'built')
    expect(delivered).toEqual([])

    await end()
    expect(delivered).toEqual(['update-1', 'built'])
  })

  it('drains host-owned queues before its own on flush', async () => {
    const { controller, send, end, delivered } = setup()
    controller.onResume(() => {
      delivered.push('host-queue')
    })
    controller.begin()

    send(built(), 'built')
    await end()

    // Module updates queued by the bundler have to land before the `BUILT`
    // that reports the compilation as finished.
    expect(delivered).toEqual(['host-queue', 'built'])
  })

  it('releases held updates when an abandoned batch times out', () => {
    const { controller, send, advance, delivered, warnings } = setup()
    controller.begin({ timeoutMs: 5_000 })

    send(turbopackUpdate(), 'update')
    expect(delivered).toEqual([])

    advance(5_000)

    expect(controller.isHolding()).toBe(false)
    expect(delivered).toEqual(['update'])
    expect(warnings.join('\n')).toContain('was not closed within 5000ms')
  })

  it('reports a timed-out batch to a late end() call', async () => {
    const { controller, advance, end } = setup()
    controller.begin({ timeoutMs: 5_000 })
    advance(5_000)

    const result = await end()

    expect(result.timedOut).toBe(true)
    expect(result.status).toBe('flushed')
  })

  it('clamps the batch timeout to a sane range', () => {
    const { controller } = setup()

    expect(controller.begin({ timeoutMs: 1 }).timeoutMs).toBe(1_000)
    controller.resetForTesting()
    expect(controller.begin({ timeoutMs: 10 ** 9 }).timeoutMs).toBe(300_000)
  })

  it('bounds the queue rather than growing without limit', async () => {
    const { controller, send, end, delivered, warnings } = setup()
    controller.begin()

    // Turbopack updates are not coalesced, so they are what can actually pile
    // up during a runaway recompile loop.
    for (let i = 0; i <= MAX_QUEUED_MESSAGES; i++) {
      send(turbopackUpdate(), `update-${i}`)
    }

    expect(delivered).toHaveLength(MAX_QUEUED_MESSAGES + 1)
    expect(warnings.join('\n')).toContain('flushing early to bound memory')

    const result = await end()
    // The preview did briefly move off the last good state, and the batch says
    // so rather than claiming a guarantee it did not keep.
    expect(result.previewPreserved).toBe(false)
  })

  it('reports what it held', async () => {
    const { controller, send, end } = setup()
    controller.begin()

    send(turbopackUpdate(), 'update-1')
    send(turbopackUpdate(), 'update-2')
    send(reloadPage(), 'reload')
    send(building(), 'building')

    const result = await end()

    expect(result.heldMessageCount).toBe(3)
    expect(result.droppedMessageCount).toBe(1)
    expect(
      result.heldMessageTypes[HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_MESSAGE]
    ).toBe(2)
    expect(
      result.heldMessageTypes[HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE]
    ).toBe(1)
  })

  it('reports status while a batch is open', () => {
    const { controller, send } = setup()
    controller.begin()
    send(turbopackUpdate(), 'update')

    expect(controller.status()).toMatchObject({
      enabled: true,
      open: true,
      heldMessageCount: 1,
      pendingFromPreviousBatch: 0,
    })
  })

  it('accepts a compile result from a host with a better error source', async () => {
    const { controller, end } = setup()
    controller.begin()

    controller.recordCompileResult([{ message: 'from the bundler' }])

    const result = await end()
    expect(result.status).toBe('withheld')
    expect(result.compiled).toBe(true)
    expect(result.errors).toEqual([{ message: 'from the bundler' }])
  })
})

describe('AgentHmrBatchController settling', () => {
  it('waits for an in-flight compilation before reporting errors', async () => {
    // Real timers here: this is the one behaviour that is about waiting.
    let compiling = false
    const controller = new AgentHmrBatchController({
      isCompiling: () => compiling,
      logger: { warn: () => {} },
    })
    controller.configure({ enabled: true })
    controller.begin()

    // The agent's write has not reached the bundler yet when it closes the
    // batch, so a naive end() would report a clean build.
    compiling = true
    const ending = controller.end({
      settle: { quietMs: 10, graceMs: 50, maxWaitMs: 5_000, pollMs: 5 },
    })

    controller.intercept(
      { type: HMR_MESSAGE_SENT_TO_BROWSER.BUILDING },
      () => {}
    )
    controller.intercept(built([{ message: 'late error' }]), () => {})
    compiling = false

    const result = await ending

    expect(result.compiled).toBe(true)
    expect(result.errors).toEqual([{ message: 'late error' }])
    expect(result.status).toBe('withheld')
  })

  it('returns promptly when the edits triggered no recompile', async () => {
    const controller = new AgentHmrBatchController({
      isCompiling: () => false,
      logger: { warn: () => {} },
    })
    controller.configure({ enabled: true })
    controller.begin()

    const startedAt = Date.now()
    const result = await controller.end({
      settle: { quietMs: 5, graceMs: 40, maxWaitMs: 5_000, pollMs: 5 },
    })

    expect(result.status).toBe('flushed')
    expect(result.compiled).toBe(false)
    // It waits out the grace period once, and does not sit until maxWaitMs.
    expect(Date.now() - startedAt).toBeLessThan(2_000)
  })
})

describe('end() outside a batch', () => {
  it('reports that there is nothing to end', async () => {
    const { controller } = setup()
    expect(await controller.end({ settle: false })).toMatchObject({
      status: 'no-batch',
      batchId: null,
    })
  })

  it('reports the feature as disabled', async () => {
    const { controller } = setup({ enabled: false })
    expect(await controller.end({ settle: false })).toMatchObject({
      status: 'disabled',
    })
  })
})
