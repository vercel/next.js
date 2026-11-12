import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import type {
  TestProcessExit,
  TestProcessOptions,
} from 'next/dist/experimental/testing/execution/process'

const mockFork = jest.fn()

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  fork: (...args: unknown[]) => mockFork(...args),
}))

const { runTestProcess } =
  require('next/dist/experimental/testing/execution/process') as typeof import('next/dist/experimental/testing/execution/process')

class MockPipe extends EventEmitter {
  destroy = jest.fn(() => this)
}

class MockChildProcess extends EventEmitter {
  pid = 4321
  connected = true
  stdout = new MockPipe()
  stderr = new MockPipe()
  kill = jest.fn(() => true)
  send = jest.fn(
    (_message: unknown, callback?: (error: Error | null) => void) => {
      callback?.(null)
      return true
    }
  )
}

function observe(promise: Promise<TestProcessExit>) {
  const state: {
    settled: boolean
    value?: TestProcessExit
    error?: unknown
  } = { settled: false }
  // Attach both handlers immediately, including while a rejection waits for the
  // child close event, so a failing owner cannot become an unhandled rejection.
  const observed = promise.then(
    (value) => {
      state.settled = true
      state.value = value
    },
    (error) => {
      state.settled = true
      state.error = error
    }
  )
  return { promise, observed, state }
}

const describeProcess = process.platform === 'win32' ? describe.skip : describe

describeProcess('typecheck process startup ownership', () => {
  let child: MockChildProcess
  let processKill: jest.SpiedFunction<typeof process.kill>
  let timeouts: jest.SpyInstance
  let timersAreFake: boolean

  beforeEach(() => {
    jest.useFakeTimers()
    timersAreFake = true
    timeouts = jest.spyOn(global, 'setTimeout')
    processKill = jest.spyOn(process, 'kill').mockReturnValue(true)
    child = new MockChildProcess()
    mockFork.mockReset().mockReturnValue(child as unknown as ChildProcess)
  })

  afterEach(() => {
    if (timersAreFake) jest.clearAllTimers()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  function start(overrides: Partial<TestProcessOptions> = {}) {
    return observe(
      runTestProcess('/owned/typecheck-worker.js', {
        cwd: __dirname,
        env: { ...process.env, NODE_ENV: 'test' },
        input: { request: 'one-owned-typecheck' },
        timeoutMs: 200,
        shutdownGraceMs: 25,
        onMessage: jest.fn(),
        ...overrides,
      })
    )
  }

  function startup() {
    return { timeoutMs: 50, timeoutError: new Error('tsc spawn timed out') }
  }

  function queuedStartupCallback() {
    const timer = timeouts.mock.calls.find((call) => call[1] === 50)
    expect(timer).toBeDefined()
    // Invoke the real owner's already-created timer callback after another
    // event wins. This covers an already-queued callback, not a new deadline.
    return timer![0] as () => void
  }

  function close(
    code: number | null = 0,
    signal: NodeJS.Signals | null = null
  ) {
    child.emit('exit', code, signal)
    child.emit('close', code, signal)
  }

  function cancels() {
    return child.send.mock.calls.filter(([message]) => {
      return (message as { type?: string }).type === 'cancel'
    })
  }

  it('keeps parent IPC readiness distinct from the actual spawn event', async () => {
    const trace: string[] = []
    let followup: Promise<void> | undefined
    const run = start({
      startup: startup(),
      onReady(send) {
        trace.push('parent-ready')
        followup = send({ type: 'followup' })
      },
      onSpawn() {
        trace.push('actual-spawn')
      },
    })

    expect(trace).toEqual(['parent-ready'])
    expect(child.send.mock.calls.map(([message]) => message)).toEqual([
      { type: 'followup' },
      { type: 'run', input: { request: 'one-owned-typecheck' } },
    ])
    await followup
    expect(run.state.settled).toBe(false)
    child.emit('spawn')
    expect(trace).toEqual(['parent-ready', 'actual-spawn'])
    child.emit('spawn')
    expect(trace).toEqual(['parent-ready', 'actual-spawn'])
    close()
    await expect(run.promise).resolves.toEqual({
      code: 0,
      signal: null,
      reason: 'exit',
    })
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps startup failure pending through grace, exit and output ownership until close', async () => {
    const policy = startup()
    const run = start({ startup: policy })

    jest.advanceTimersByTime(50)
    expect(cancels()).toHaveLength(1)
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    jest.advanceTimersByTime(25)
    expect(processKill).toHaveBeenCalledWith(-child.pid, 'SIGKILL')
    expect(child.stdout.destroy).toHaveBeenCalledTimes(1)
    expect(child.stderr.destroy).toHaveBeenCalledTimes(1)
    child.emit('exit', null, 'SIGKILL')
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    child.emit('close', null, 'SIGKILL')
    await run.observed
    expect(run.state.error).toBe(policy.timeoutError)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('does not let IPC readiness or output disarm the startup deadline', async () => {
    const ready = jest.fn()
    const output = jest.fn()
    const policy = startup()
    const run = start({ startup: policy, onReady: ready, onOutput: output })

    child.stdout.emit('data', Buffer.from('checker output'))
    expect(ready).toHaveBeenCalledTimes(1)
    expect(output).toHaveBeenCalledWith('stdout', Buffer.from('checker output'))
    jest.advanceTimersByTime(50)
    expect(cancels()).toHaveLength(1)
    close(null, 'SIGKILL')
    await run.observed
    expect(run.state.error).toBe(policy.timeoutError)
  })

  it('disarms on actual spawn while retaining the full checker deadline', async () => {
    const run = start({ startup: startup(), timeoutMs: 100 })
    const oldStartupCallback = queuedStartupCallback()

    child.emit('spawn')
    oldStartupCallback()
    jest.advanceTimersByTime(99)
    expect(cancels()).toHaveLength(0)
    expect(run.state.settled).toBe(false)
    jest.advanceTimersByTime(1)
    expect(cancels()).toHaveLength(1)
    child.emit('exit', null, 'SIGKILL')
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    child.emit('close', null, 'SIGKILL')
    await expect(run.promise).resolves.toEqual({
      code: null,
      signal: 'SIGKILL',
      reason: 'timeout',
    })
  })

  it('adds no startup timer for an existing caller without a startup policy', async () => {
    const onSpawn = jest.fn()
    const run = start({ timeoutMs: undefined, onSpawn })

    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(1000)
    expect(cancels()).toHaveLength(0)
    child.emit('spawn')
    expect(onSpawn).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
    close()
    await expect(run.promise).resolves.toMatchObject({ reason: 'exit' })
    expect(jest.getTimerCount()).toBe(0)
  })

  it.each([undefined, 0])(
    'keeps a present startup policy enabled with native delay %s',
    async (timeoutMs) => {
      const policy = {
        timeoutMs,
        timeoutError: new Error('tsc spawn timed out'),
      }
      const run = start({ startup: policy })

      expect(timeouts).toHaveBeenCalledWith(expect.any(Function), timeoutMs)
      jest.advanceTimersByTime(1)
      expect(cancels()).toHaveLength(1)
      close(null, 'SIGKILL')
      await run.observed
      expect(run.state.error).toBe(policy.timeoutError)
    }
  )

  it('does not fork or arm a startup timer after an existing abort', async () => {
    const controller = new AbortController()
    controller.abort(new Error('original abort'))
    const run = start({ signal: controller.signal, startup: startup() })

    await expect(run.promise).resolves.toEqual({
      code: null,
      signal: null,
      reason: 'cancelled',
    })
    expect(mockFork).not.toHaveBeenCalled()
    expect(timeouts).not.toHaveBeenCalled()
  })

  it('preserves an earlier whole-file timeout despite a queued startup callback', async () => {
    const run = start({ timeoutMs: 10, startup: startup() })
    const oldStartupCallback = queuedStartupCallback()
    jest.advanceTimersByTime(10)
    oldStartupCallback()
    expect(cancels()).toHaveLength(1)
    close(null, 'SIGKILL')
    await expect(run.promise).resolves.toMatchObject({ reason: 'timeout' })
    expect(run.state.error).toBeUndefined()
  })

  it('preserves cancellation despite a queued startup callback and late spawn', async () => {
    const controller = new AbortController()
    const onSpawn = jest.fn()
    const run = start({
      signal: controller.signal,
      startup: startup(),
      onSpawn,
    })
    const oldStartupCallback = queuedStartupCallback()

    controller.abort(new Error('original caller abort'))
    oldStartupCallback()
    child.emit('spawn')
    expect(onSpawn).not.toHaveBeenCalled()
    expect(cancels()).toHaveLength(1)
    close(null, 'SIGKILL')
    await expect(run.promise).resolves.toMatchObject({ reason: 'cancelled' })
    expect(controller.signal.reason.message).toBe('original caller abort')
    expect(run.state.error).toBeUndefined()
  })

  it('retains the original process error ahead of later IPC and startup consequences', async () => {
    const original = new Error('actual spawn failed')
    const callbacks: Array<(error: Error | null) => void> = []
    child.send.mockImplementation((_message, callback) => {
      if (callback) callbacks.push(callback)
      return true
    })
    const run = start({ startup: startup() })
    const oldStartupCallback = queuedStartupCallback()

    child.emit('error', original)
    callbacks[0](new Error('IPC consequence'))
    oldStartupCallback()
    jest.advanceTimersByTime(50)
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    close(null, null)
    await run.observed
    expect(run.state.error).toBe(original)
    expect(cancels()).toHaveLength(1)
  })

  it('retains a throwing spawn observer and waits for close before rejection', async () => {
    const original = new Error('spawn observer failed')
    const onMessage = jest.fn()
    const run = start({
      startup: startup(),
      onMessage,
      onSpawn() {
        throw original
      },
    })
    const oldStartupCallback = queuedStartupCallback()

    child.emit('spawn')
    child.emit('message', { type: 'late-completion' })
    oldStartupCallback()
    expect(onMessage).not.toHaveBeenCalled()
    expect(cancels()).toHaveLength(1)
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    child.emit('exit', null, 'SIGKILL')
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    child.emit('close', null, 'SIGKILL')
    await run.observed
    expect(run.state.error).toBe(original)
  })

  it('cannot revive startup after a terminal close or natural exit', async () => {
    const onSpawn = jest.fn()
    const run = start({ startup: startup(), onSpawn })
    const oldStartupCallback = queuedStartupCallback()

    child.emit('exit', 0, null)
    oldStartupCallback()
    child.emit('spawn')
    expect(onSpawn).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(run.state.settled).toBe(false)
    child.emit('close', 0, null)
    await expect(run.promise).resolves.toMatchObject({ reason: 'exit' })
    oldStartupCallback()
    child.emit('spawn')
    jest.advanceTimersByTime(1000)
    expect(cancels()).toHaveLength(0)
    expect(run.state.error).toBeUndefined()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('does not turn parent-requested post-completion termination into startup failure', async () => {
    let finish: (() => void) | undefined
    const onSpawn = jest.fn()
    const run = start({
      startup: startup(),
      onSpawn,
      onReady(_send, terminateAfterCompletion) {
        finish = terminateAfterCompletion
      },
    })
    const oldStartupCallback = queuedStartupCallback()

    finish!()
    oldStartupCallback()
    child.emit('spawn')
    expect(onSpawn).not.toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(cancels()).toHaveLength(0)
    close(null, 'SIGTERM')
    await expect(run.promise).resolves.toMatchObject({ reason: 'exit' })
    expect(run.state.error).toBeUndefined()
  })

  it('uses actual OS spawn before a held plain worker body and joins its physical exit', async () => {
    timeouts.mockRestore()
    processKill.mockRestore()
    jest.useRealTimers()
    timersAreFake = false
    const realFork =
      jest.requireActual<typeof import('child_process')>('child_process').fork
    let owned: ChildProcess | undefined
    let physicallyClosed = false
    mockFork.mockImplementationOnce((...args: Parameters<typeof realFork>) => {
      owned = realFork(...args)
      owned.once('close', () => {
        physicallyClosed = true
      })
      return owned
    })
    const trace: string[] = []
    let finish: ((message: unknown) => Promise<void>) | undefined
    let held!: () => void
    const bodyHeld = new Promise<void>((resolve) => {
      held = resolve
    })
    const controller = new AbortController()
    const startupError = new Error('plain worker spawn timed out')
    const run = observe(
      runTestProcess(path.join(__dirname, 'held-worker.cjs'), {
        cwd: __dirname,
        env: { ...process.env, NODE_ENV: 'test' },
        input: { request: 'real-plain-worker' },
        startup: { timeoutMs: 0, timeoutError: startupError },
        timeoutMs: 5000,
        shutdownGraceMs: 100,
        signal: controller.signal,
        onReady(send) {
          trace.push('parent-ready')
          finish = send
        },
        onSpawn() {
          trace.push('actual-spawn')
        },
        onMessage(message) {
          const event = message as { type?: string; pid?: number }
          if (event.type === 'body-held') {
            expect(event.pid).toBe(owned!.pid)
            trace.push('body-held')
            held()
          } else {
            expect(event).toEqual({ type: 'body-finished' })
            trace.push('body-finished')
          }
        },
      })
    )

    try {
      await Promise.race([
        bodyHeld,
        run.promise.then(() => {
          throw new Error('Plain worker closed before its body gate')
        }),
      ])
      expect(trace).toEqual(['parent-ready', 'actual-spawn', 'body-held'])
      expect(run.state.settled).toBe(false)
      expect(physicallyClosed).toBe(false)
      expect(owned!.exitCode).toBeNull()
      await finish!({ type: 'finish' })
      await expect(run.promise).resolves.toEqual({
        code: 0,
        signal: null,
        reason: 'exit',
      })
      expect(trace).toEqual([
        'parent-ready',
        'actual-spawn',
        'body-held',
        'body-finished',
      ])
      expect(physicallyClosed).toBe(true)
      expect(() => process.kill(owned!.pid!, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
      expect(() => process.kill(-owned!.pid!, 0)).toThrow(
        expect.objectContaining({ code: 'ESRCH' })
      )
    } finally {
      controller.abort(new Error('plain worker test cleanup'))
      await run.observed
    }
  })
})
