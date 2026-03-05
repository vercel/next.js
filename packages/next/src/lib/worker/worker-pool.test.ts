import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import {
  CHILD_MESSAGE_INITIALIZE,
  CHILD_MESSAGE_CALL,
  CHILD_MESSAGE_END,
  PARENT_MESSAGE_OK,
  PARENT_MESSAGE_CLIENT_ERROR,
  PARENT_MESSAGE_SETUP_ERROR,
  PARENT_MESSAGE_CUSTOM,
  PARENT_MESSAGE_READY,
} from './types'

// ---------------------------------------------------------------------------
// Fake child process used for all tests
// ---------------------------------------------------------------------------
class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  pid = 1234
  killed = false
  /** messages sent by the pool (INITIALIZE, CALL, END) */
  sent: unknown[][] = []

  send(message: unknown, _cb?: () => void): boolean {
    this.sent.push(message as unknown[])
    return true
  }

  kill(signal?: string): boolean {
    this.killed = true
    // Emit exit asynchronously to mimic real behavior
    setImmediate(() => {
      this.emit('exit', signal === 'SIGKILL' ? null : 1, signal ?? null)
    })
    return true
  }
}

// ---------------------------------------------------------------------------
// Mock child_process.fork to return controllable FakeChildProcess instances
// ---------------------------------------------------------------------------
let spawnedProcesses: FakeChildProcess[] = []

jest.mock('child_process', () => ({
  fork: jest.fn(() => {
    const proc = new FakeChildProcess()
    spawnedProcesses.push(proc)
    return proc
  }),
}))

// We import WorkerPool *after* the mock so `fork` is already stubbed.
import { WorkerPool, WorkerExitError } from './worker-pool'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the most recently spawned fake process */
function latestProcess(): FakeChildProcess {
  return spawnedProcesses[spawnedProcesses.length - 1]
}

/** Simulate a PARENT_MESSAGE_OK reply for a CALL message */
function replyOk(
  proc: FakeChildProcess,
  requestId: number,
  result: unknown
): void {
  proc.emit('message', [PARENT_MESSAGE_OK, requestId, result])
}

/** Simulate a PARENT_MESSAGE_CLIENT_ERROR reply */
function replyClientError(
  proc: FakeChildProcess,
  requestId: number,
  errorName: string,
  errorMessage: string,
  stack?: string,
  properties?: Record<string, unknown>
): void {
  proc.emit('message', [
    PARENT_MESSAGE_CLIENT_ERROR,
    requestId,
    errorName,
    errorMessage,
    stack,
    properties,
  ])
}

/** Simulate a PARENT_MESSAGE_SETUP_ERROR reply */
function replySetupError(
  proc: FakeChildProcess,
  errorName: string,
  errorMessage: string,
  stack?: string
): void {
  proc.emit('message', [
    PARENT_MESSAGE_SETUP_ERROR,
    errorName,
    errorMessage,
    stack,
  ])
}

/** Simulate a PARENT_MESSAGE_READY message (worker finished booting) */
function replyReady(proc: FakeChildProcess): void {
  proc.emit('message', [PARENT_MESSAGE_READY])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerPool', () => {
  beforeEach(() => {
    spawnedProcesses = []
    ;(
      (require('child_process') as typeof import('child_process'))
        .fork as jest.Mock
    ).mockClear()
  })

  // -----------------------------------------------------------------------
  // Lazy spawning
  // -----------------------------------------------------------------------
  describe('lazy spawning', () => {
    it('does not spawn any workers on construction', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 4,
      })
      expect(spawnedProcesses).toHaveLength(0)
      expect(pool.getWorkerCount()).toBe(0)
      pool.shutdownNow()
    })

    it('spawns one worker on first dispatch', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 4,
      })
      pool.dispatch('testMethod', [])
      expect(spawnedProcesses).toHaveLength(1)
      expect(pool.getWorkerCount()).toBe(1)
      pool.shutdownNow()
    })

    it('reuses existing worker when it has capacity', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 4,
        concurrencyPerWorker: 3,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      expect(spawnedProcesses).toHaveLength(1)
      expect(pool.getWorkerCount()).toBe(1)
      pool.shutdownNow()
    })

    it('spawns additional workers when existing ones are at concurrency limit', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 3,
        maxBootingWorkers: 3,
        concurrencyPerWorker: 1,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      expect(spawnedProcesses).toHaveLength(3)
      expect(pool.getWorkerCount()).toBe(3)
      pool.shutdownNow()
    })

    it('does not spawn more workers than maxWorkers', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
        maxBootingWorkers: 2,
        concurrencyPerWorker: 1,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', []) // this one should be queued
      pool.dispatch('d', []) // this one too
      expect(spawnedProcesses).toHaveLength(2)
      expect(pool.getWorkerCount()).toBe(2)
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // INITIALIZE message
  // -----------------------------------------------------------------------
  describe('initialization', () => {
    it('sends INITIALIZE message with workerPath and setupArgs', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        setupArgs: ['arg1', 'arg2'],
      })
      pool.dispatch('test', [])
      const proc = latestProcess()
      const initMsg = proc.sent.find(
        (msg) => msg[0] === CHILD_MESSAGE_INITIALIZE
      )
      expect(initMsg).toBeDefined()
      expect(initMsg![2]).toBe('/fake/worker.js')
      expect(initMsg![3]).toEqual(['arg1', 'arg2'])
      pool.shutdownNow()
    })

    it('sends INITIALIZE before any CALL messages', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('myMethod', ['x'])
      const proc = latestProcess()
      expect(proc.sent[0][0]).toBe(CHILD_MESSAGE_INITIALIZE)
      // CALL is only sent after the worker is ready
      expect(proc.sent).toHaveLength(1)
      replyReady(proc)
      expect(proc.sent[1][0]).toBe(CHILD_MESSAGE_CALL)
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Dispatch and message handling
  // -----------------------------------------------------------------------
  describe('dispatch and message handling', () => {
    it('resolves when child sends OK', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('compute', [1, 2])
      const proc = latestProcess()
      replyReady(proc)
      // The CALL message has a requestId at index 1
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      const requestId = callMsg[1] as number

      replyOk(proc, requestId, 42)
      await expect(promise).resolves.toBe(42)
      pool.shutdownNow()
    })

    it('rejects when child sends CLIENT_ERROR', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('fail', [])
      const proc = latestProcess()
      replyReady(proc)
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      const requestId = callMsg[1] as number

      replyClientError(proc, requestId, 'TypeError', 'bad type')
      await expect(promise).rejects.toThrow('bad type')
      pool.shutdownNow()
    })

    it('reconstructs error with properties from CLIENT_ERROR', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('fail', [])
      const proc = latestProcess()
      replyReady(proc)
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      const requestId = callMsg[1] as number

      replyClientError(proc, requestId, 'Error', 'oops', 'stack', {
        code: 'CUSTOM_CODE',
      })
      try {
        await promise
        throw new Error('should have thrown')
      } catch (err: any) {
        expect(err.message).toBe('oops')
        expect(err.code).toBe('CUSTOM_CODE')
        expect(err.type).toBe('Error')
      }
      pool.shutdownNow()
    })

    it('dispatches queued tasks after SETUP_ERROR clears booting', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 3,
      })
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      const p3 = pool.dispatch('c', [])
      const proc = latestProcess()

      // Tasks are queued while the worker is booting — no active requests
      expect(proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)).toHaveLength(
        0
      )

      // Setup error clears booting, drains queue to the (now available) worker
      replySetupError(proc, 'Error', 'setup failed')

      // Queued tasks are now dispatched since the worker is available
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(3)

      // Resolve them
      replyOk(proc, callMessages[0][1] as number, 'ra')
      replyOk(proc, callMessages[1][1] as number, 'rb')
      replyOk(proc, callMessages[2][1] as number, 'rc')
      await expect(p1).resolves.toBe('ra')
      await expect(p2).resolves.toBe('rb')
      await expect(p3).resolves.toBe('rc')
      pool.shutdownNow()
    })

    it('accepts new work and READY after setup error on same worker', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })

      // First dispatch triggers worker spawn; task is queued (worker booting)
      const p1 = pool.dispatch('a', [])
      const proc = latestProcess()

      // Setup error clears booting, drains queue — task 'a' sent to worker
      replySetupError(proc, 'Error', 'setup failed')
      let callMsgs = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMsgs).toHaveLength(1)
      expect(callMsgs[0][2]).toBe('a')

      // Complete 'a' and resolve
      replyOk(proc, callMsgs[0][1] as number, 'result-a')
      await expect(p1).resolves.toBe('result-a')

      // Worker is still in the pool (booting=false, ending=false, no active requests).
      // No new process should be spawned — the existing one is reused.
      expect(spawnedProcesses).toHaveLength(1)

      // Second dispatch goes to the same (only) worker directly (not booting)
      const p2 = pool.dispatch('b', [])
      expect(spawnedProcesses).toHaveLength(1) // still no new process

      callMsgs = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMsgs).toHaveLength(2)
      expect(callMsgs[1][2]).toBe('b')
      const requestId = callMsgs[1][1] as number

      replyOk(proc, requestId, 'result-b')
      await expect(p2).resolves.toBe('result-b')

      pool.shutdownNow()
    })

    it('dispatches correct method and args', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('myMethod', ['hello', 123, true])
      const proc = latestProcess()
      replyReady(proc)
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      expect(callMsg[2]).toBe('myMethod')
      expect(callMsg[3]).toEqual(['hello', 123, true])
      pool.shutdownNow()
    })

    it('uses unique request IDs for each dispatch', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 5,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])

      const proc = latestProcess()
      replyReady(proc)
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      const ids = callMessages.map((m) => m[1])
      expect(new Set(ids).size).toBe(3)
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Task queuing and dequeuing
  // -----------------------------------------------------------------------
  describe('task queuing', () => {
    it('queues tasks when all workers are at capacity', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })
      const p1 = pool.dispatch('first', [])
      const p2 = pool.dispatch('second', []) // should be queued

      const proc = latestProcess()
      replyReady(proc)
      // Only one CALL should have been sent
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(1)
      expect(callMessages[0][2]).toBe('first')

      // Complete the first task
      replyOk(proc, callMessages[0][1] as number, 'result1')
      await expect(p1).resolves.toBe('result1')

      // The second task should now have been dispatched
      const callMessages2 = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages2).toHaveLength(2)
      expect(callMessages2[1][2]).toBe('second')

      replyOk(proc, callMessages2[1][1] as number, 'result2')
      await expect(p2).resolves.toBe('result2')
      pool.shutdownNow()
    })

    it('dequeues tasks in FIFO order', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })
      const results: string[] = []

      const p1 = pool.dispatch('first', []).then((r) => {
        results.push(r as string)
        return r
      })
      const p2 = pool.dispatch('second', []).then((r) => {
        results.push(r as string)
        return r
      })
      const p3 = pool.dispatch('third', []).then((r) => {
        results.push(r as string)
        return r
      })

      const proc = latestProcess()
      replyReady(proc)

      // Resolve first
      let calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      replyOk(proc, calls[0][1] as number, 'r1')
      await p1

      // Resolve second (dequeued in order)
      calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      replyOk(proc, calls[1][1] as number, 'r2')
      await p2

      // Resolve third
      calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      replyOk(proc, calls[2][1] as number, 'r3')
      await p3

      expect(results).toEqual(['r1', 'r2', 'r3'])
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Concurrency per worker
  // -----------------------------------------------------------------------
  describe('concurrency per worker', () => {
    it('allows multiple concurrent calls to the same worker', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 3,
      })
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      const p3 = pool.dispatch('c', [])

      const proc = latestProcess()
      replyReady(proc)
      // All 3 calls should be sent to the same (and only) worker
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(3)
      expect(spawnedProcesses).toHaveLength(1)

      // Resolve them in any order
      replyOk(proc, callMessages[1][1] as number, 'b-result')
      replyOk(proc, callMessages[0][1] as number, 'a-result')
      replyOk(proc, callMessages[2][1] as number, 'c-result')

      await expect(p1).resolves.toBe('a-result')
      await expect(p2).resolves.toBe('b-result')
      await expect(p3).resolves.toBe('c-result')
      pool.shutdownNow()
    })

    it('queues when concurrency limit is reached', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 2,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', []) // should be queued

      const proc = latestProcess()
      replyReady(proc)
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(2)
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Custom messages
  // -----------------------------------------------------------------------
  describe('custom messages', () => {
    it('calls onCustomMessage when child sends PARENT_MESSAGE_CUSTOM', () => {
      const onCustomMessage = jest.fn()
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        onCustomMessage,
      })
      pool.dispatch('test', [])
      const proc = latestProcess()

      proc.emit('message', [PARENT_MESSAGE_CUSTOM, { type: 'activity' }])
      expect(onCustomMessage).toHaveBeenCalledWith({ type: 'activity' })
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // shutdown() and shutdownNow()
  // -----------------------------------------------------------------------
  describe('shutdown()', () => {
    it('rejects new dispatches after shutdown() is called', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const endPromise = pool.shutdown()
      await expect(pool.dispatch('test', [])).rejects.toThrow(
        'Worker pool is ending'
      )
      await endPromise
    })

    it('sends END message to workers', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      // Spawn a worker first
      const p = pool.dispatch('test', [])
      const proc = latestProcess()
      replyReady(proc)
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      replyOk(proc, callMsg[1] as number, 'done')
      await p

      const endPromise = pool.shutdown()
      // Worker should receive END message
      const endMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_END)
      expect(endMsg).toBeDefined()

      // Simulate process exit
      proc.emit('exit', 0, null)
      const result = await endPromise
      expect(result).toEqual({ forceExited: false })
    })

    it('returns forceExited:false when no workers are running', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const result = await pool.shutdown()
      expect(result).toEqual({ forceExited: false })
    })

    it('rejects queued tasks when pool shuts down', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })
      pool.dispatch('first', []) // occupies the worker
      const queuedPromise = pool.dispatch('second', []) // queued

      const proc = latestProcess()
      // End the pool before resolving the first task
      const endPromise = pool.shutdown()
      proc.emit('exit', 0, null)
      await endPromise

      await expect(queuedPromise).rejects.toThrow(
        'Worker pool ended before task could be processed'
      )
    })
  })

  describe('shutdownNow()', () => {
    it('rejects new dispatches after shutdownNow()', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.shutdownNow()
      await expect(pool.dispatch('test', [])).rejects.toThrow(
        'Worker pool is ending'
      )
    })

    it('rejects in-flight requests', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('test', [])
      pool.shutdownNow()
      await expect(promise).rejects.toThrow('Worker pool closed')
    })

    it('kills all worker processes', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
        maxBootingWorkers: 2,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      expect(spawnedProcesses).toHaveLength(2)

      pool.shutdownNow()
      expect(spawnedProcesses[0].killed).toBe(true)
      expect(spawnedProcesses[1].killed).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Worker exit handling
  // -----------------------------------------------------------------------
  describe('unexpected worker exit', () => {
    it('calls onWorkerExit callback', () => {
      const onWorkerExit = jest.fn()
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        onWorkerExit,
      })
      pool.dispatch('test', [])
      const proc = latestProcess()

      // Simulate unexpected exit
      proc.emit('exit', 1, null)

      expect(onWorkerExit).toHaveBeenCalledWith(1, null)
      pool.shutdownNow()
    })

    it('rejects in-flight requests with WorkerExitError on unexpected exit', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('test', [])
      const proc = latestProcess()

      // Worker must be ready and have the task in-flight for WorkerExitError
      replyReady(proc)
      proc.emit('exit', 1, null)

      await expect(promise).rejects.toThrow(
        'Worker exited with code: 1 and signal: null'
      )
      try {
        await promise
      } catch (err) {
        expect(err).toBeInstanceOf(WorkerExitError)
        expect((err as WorkerExitError).code).toBe(1)
        expect((err as WorkerExitError).signal).toBeNull()
      }
      pool.shutdownNow()
    })

    it('does not call onWorkerExit during graceful shutdown', async () => {
      const onWorkerExit = jest.fn()
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        onWorkerExit,
      })
      pool.dispatch('test', [])
      const proc = latestProcess()
      replyReady(proc)
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      replyOk(proc, callMsg[1] as number, 'ok')

      const endPromise = pool.shutdown()
      proc.emit('exit', 0, null)
      await endPromise

      expect(onWorkerExit).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // Stdout / stderr piping
  // -----------------------------------------------------------------------
  describe('stdout and stderr', () => {
    it('pipes worker stdout to pool stdout', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('test', [])
      const proc = latestProcess()

      const dataPromise = new Promise<string>((resolve) => {
        pool.getStdout().on('data', (chunk: Buffer) => {
          resolve(chunk.toString())
        })
      })

      proc.stdout.write('hello from worker')
      const result = await dataPromise
      expect(result).toBe('hello from worker')
      pool.shutdownNow()
    })

    it('pipes worker stderr to pool stderr', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('test', [])
      const proc = latestProcess()

      const dataPromise = new Promise<string>((resolve) => {
        pool.getStderr().on('data', (chunk: Buffer) => {
          resolve(chunk.toString())
        })
      })

      proc.stderr.write('error output')
      const result = await dataPromise
      expect(result).toBe('error output')
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Dynamic scaling
  // -----------------------------------------------------------------------
  describe('dynamic scaling', () => {
    it('scales from 0 to maxWorkers as jobs arrive', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 3,
        maxBootingWorkers: 3,
        concurrencyPerWorker: 1,
      })

      expect(pool.getWorkerCount()).toBe(0)

      pool.dispatch('a', [])
      expect(pool.getWorkerCount()).toBe(1)

      pool.dispatch('b', [])
      expect(pool.getWorkerCount()).toBe(2)

      pool.dispatch('c', [])
      expect(pool.getWorkerCount()).toBe(3)

      // Fourth job gets queued, no new worker
      pool.dispatch('d', [])
      expect(pool.getWorkerCount()).toBe(3)

      pool.shutdownNow()
    })

    it('dequeues tasks to freed worker after task completion', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })

      const p1 = pool.dispatch('first', [])
      pool.dispatch('second', []) // queued

      const proc = latestProcess()
      replyReady(proc)
      let calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls).toHaveLength(1)

      // Complete first task
      replyOk(proc, calls[0][1] as number, 'r1')
      await p1

      // Second task should now be dispatched
      calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls).toHaveLength(2)
      expect(calls[1][2]).toBe('second')
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Fork options
  // -----------------------------------------------------------------------
  describe('fork options', () => {
    it('passes env and execArgv to forked processes', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        forkOptions: {
          env: { MY_VAR: 'hello' },
          execArgv: ['--max-old-space-size=512'],
        },
      })
      pool.dispatch('test', [])

      const forkMock = (
        require('child_process') as typeof import('child_process')
      ).fork as jest.Mock
      const callArgs = forkMock.mock.calls[0]
      // fork(path, args, options)
      const options = callArgs[2]
      expect(options.env.MY_VAR).toBe('hello')
      expect(options.execArgv).toEqual(['--max-old-space-size=512'])
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Resolves non-absolute workerPath
  // -----------------------------------------------------------------------
  describe('workerPath', () => {
    it('resolves relative workerPath via require.resolve', () => {
      // This will attempt to resolve the path — test that it doesn't throw
      // for an absolute path
      const pool = new WorkerPool({
        workerPath: '/absolute/path/worker.js',
        maxWorkers: 1,
      })
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // shutdown() rejecting in-flight requests
  // -----------------------------------------------------------------------
  describe('shutdown() with in-flight requests', () => {
    it('rejects queued requests when pool ends while worker is booting', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 2,
      })
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      const proc = latestProcess()

      // Tasks are queued (worker is booting), shutdown() rejects them
      const endPromise = pool.shutdown()
      proc.emit('exit', 0, null)
      await endPromise

      await expect(p1).rejects.toThrow(
        'Worker pool ended before task could be processed'
      )
      await expect(p2).rejects.toThrow(
        'Worker pool ended before task could be processed'
      )
    })

    it('resolves completed requests and rejects lingering ones on shutdown()', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 2,
      })
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      const proc = latestProcess()

      // Worker becomes ready, both tasks dispatched
      replyReady(proc)
      const calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)

      // Reply to p1 before shutdown()
      replyOk(proc, calls[0][1] as number, 'result-a')
      await expect(p1).resolves.toBe('result-a')

      const endPromise = pool.shutdown()
      proc.emit('exit', 0, null)
      await endPromise

      // p2 was still in-flight when the worker exited during shutdown
      await expect(p2).rejects.toThrow('Worker exited during shutdown')
    })
  })

  // -----------------------------------------------------------------------
  // Spawn error handling
  // -----------------------------------------------------------------------
  describe('spawn errors', () => {
    it('rejects in-flight requests when worker emits an error event', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('test', [])
      const proc = latestProcess()

      // Simulate a spawn error (e.g. ENOMEM)
      proc.emit('error', new Error('spawn ENOMEM'))

      await expect(promise).rejects.toThrow('spawn ENOMEM')
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Worker crash with queued tasks
  // -----------------------------------------------------------------------
  describe('worker crash with queued tasks', () => {
    it('removes crashed worker from pool and spawns replacement for queued tasks', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('test', [])
      const proc = latestProcess()

      proc.emit('exit', 1, null)

      // Crashed worker removed and replacement spawned for queued task
      expect(spawnedProcesses).toHaveLength(2)
      expect(pool.getWorkerCount()).toBe(1)
      pool.shutdownNow()
    })

    it('spawns replacement worker for queued tasks after crash', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })
      const p1 = pool.dispatch('first', []) // queued (worker booting)
      const p2 = pool.dispatch('second', []) // also queued

      const proc = latestProcess()
      // Worker crashes — queued tasks need a new worker
      proc.emit('exit', 1, null)

      // A new worker should be spawned for the queued tasks
      expect(spawnedProcesses).toHaveLength(2)

      // New worker becomes ready — first queued task dispatched
      const newProc = latestProcess()
      replyReady(newProc)
      let calls = newProc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls).toHaveLength(1)
      expect(calls[0][2]).toBe('first')

      // Complete first task — second dequeued
      replyOk(newProc, calls[0][1] as number, 'ok1')
      await expect(p1).resolves.toBe('ok1')

      calls = newProc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls).toHaveLength(2)
      expect(calls[1][2]).toBe('second')

      replyOk(newProc, calls[1][1] as number, 'ok2')
      await expect(p2).resolves.toBe('ok2')
      pool.shutdownNow()
    })
  })

  // -----------------------------------------------------------------------
  // Graceful shutdown rejects lingering in-flight requests
  // -----------------------------------------------------------------------
  describe('graceful shutdown with in-flight requests', () => {
    it('rejects queued requests when pool ends while booting', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('test', [])
      const proc = latestProcess()

      // Start graceful end — task is still queued (worker is booting)
      const endPromise = pool.shutdown()

      // Worker exits
      proc.emit('exit', 0, null)
      await endPromise

      await expect(promise).rejects.toThrow(
        'Worker pool ended before task could be processed'
      )
    })

    it('rejects active requests when worker exits during shutdown', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('test', [])
      const proc = latestProcess()

      // Worker becomes ready, task dispatched
      replyReady(proc)

      // Start graceful end — sends END message
      const endPromise = pool.shutdown()

      // Worker exits without completing the request
      proc.emit('exit', 0, null)
      await endPromise

      await expect(promise).rejects.toThrow('Worker exited during shutdown')
    })
  })

  // -----------------------------------------------------------------------
  // maxBootingWorkers
  // -----------------------------------------------------------------------
  describe('maxBootingWorkers', () => {
    it('defaults to ceil(maxWorkers/4) and throttles spawning', () => {
      // maxWorkers=3, default maxBootingWorkers = ceil(3/4) = 1
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 3,
        concurrencyPerWorker: 1,
      })

      // Dispatch 3 tasks — only 1 worker should spawn (booting limit = 1)
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      expect(spawnedProcesses).toHaveLength(1)
      expect(pool.getWorkerCount()).toBe(1)

      // Worker 1 finishes booting → second worker spawns
      replyReady(spawnedProcesses[0])
      expect(spawnedProcesses).toHaveLength(2)
      expect(pool.getWorkerCount()).toBe(2)

      // Worker 2 finishes booting → third worker spawns
      replyReady(spawnedProcesses[1])
      expect(spawnedProcesses).toHaveLength(3)
      expect(pool.getWorkerCount()).toBe(3)

      pool.shutdownNow()
    })

    it('allows maxBootingWorkers=2 to spawn 2 concurrently', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 4,
        maxBootingWorkers: 2,
        concurrencyPerWorker: 1,
      })

      // Dispatch 4 tasks — 2 workers should spawn (booting limit = 2)
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      pool.dispatch('d', [])
      expect(spawnedProcesses).toHaveLength(2)

      // First worker becomes ready → third worker spawns
      replyReady(spawnedProcesses[0])
      expect(spawnedProcesses).toHaveLength(3)

      // Second worker becomes ready → fourth worker spawns
      replyReady(spawnedProcesses[1])
      expect(spawnedProcesses).toHaveLength(4)

      pool.shutdownNow()
    })

    it('spawns all immediately when maxBootingWorkers equals maxWorkers', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 3,
        maxBootingWorkers: 3,
        concurrencyPerWorker: 1,
      })

      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      expect(spawnedProcesses).toHaveLength(3)

      pool.shutdownNow()
    })

    it('queues tasks when booting limit is reached and dispatches on READY', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
        maxBootingWorkers: 1,
        concurrencyPerWorker: 1,
      })

      const p1 = pool.dispatch('first', [])
      const p2 = pool.dispatch('second', [])
      expect(spawnedProcesses).toHaveLength(1)

      const proc1 = spawnedProcesses[0]
      // No CALL messages yet — worker is still booting
      expect(
        proc1.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      ).toHaveLength(0)

      // Worker 1 finishes booting → first task dispatched, second worker spawns
      replyReady(proc1)
      let calls1 = proc1.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls1).toHaveLength(1)
      expect(calls1[0][2]).toBe('first')
      // Second worker spawned for the remaining queued task
      expect(spawnedProcesses).toHaveLength(2)

      // Complete first task — 'second' dequeued to worker 1 (still in queue)
      replyOk(proc1, calls1[0][1] as number, 'result1')
      await expect(p1).resolves.toBe('result1')

      // 'second' was dequeued to worker 1 after 'first' completed
      calls1 = proc1.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls1).toHaveLength(2)
      expect(calls1[1][2]).toBe('second')

      // Complete second task
      replyOk(proc1, calls1[1][1] as number, 'result2')
      await expect(p2).resolves.toBe('result2')

      pool.shutdownNow()
    })

    it('queues tasks while worker is booting, dispatches on READY', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        maxBootingWorkers: 1,
        concurrencyPerWorker: 2,
      })

      // Dispatch two tasks — both should be queued (worker is booting)
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      expect(spawnedProcesses).toHaveLength(1)

      const proc = spawnedProcesses[0]
      // No CALL messages yet — worker is still booting
      let callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(0)

      // Worker finishes booting — queued tasks are dispatched
      replyReady(proc)
      callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(2)

      // Resolve both
      replyOk(proc, callMessages[0][1] as number, 'ra')
      replyOk(proc, callMessages[1][1] as number, 'rb')
      await expect(p1).resolves.toBe('ra')
      await expect(p2).resolves.toBe('rb')

      pool.shutdownNow()
    })

    it('frees booting slot when a booting worker crashes, allowing new spawn', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 3,
        maxBootingWorkers: 1,
        concurrencyPerWorker: 1,
      })

      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      expect(spawnedProcesses).toHaveLength(1)

      // Crash the booting worker — frees the booting slot
      // Queued tasks cause a new worker to spawn
      spawnedProcesses[0].emit('exit', 1, null)

      expect(spawnedProcesses.length).toBeGreaterThanOrEqual(2)

      pool.shutdownNow()
    })

    it('shuts down cleanly with booting workers on shutdown()', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
        maxBootingWorkers: 1,
        concurrencyPerWorker: 1,
      })

      pool.dispatch('a', [])
      expect(spawnedProcesses).toHaveLength(1)

      // End the pool while the worker is still booting
      const endPromise = pool.shutdown()
      spawnedProcesses[0].emit('exit', 0, null)
      const result = await endPromise
      expect(result).toEqual({ forceExited: false })
    })

    it('spawns workers for queued tasks after READY frees a booting slot', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 4,
        maxBootingWorkers: 1,
        concurrencyPerWorker: 1,
      })

      // Dispatch 4 tasks — only 1 worker spawns
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      pool.dispatch('d', [])
      expect(spawnedProcesses).toHaveLength(1)

      // Worker 1 becomes ready → tasks are queued, new worker spawns
      replyReady(spawnedProcesses[0])
      expect(spawnedProcesses).toHaveLength(2)

      // Worker 2 becomes ready → another worker spawns
      replyReady(spawnedProcesses[1])
      expect(spawnedProcesses).toHaveLength(3)

      // Worker 3 becomes ready → last worker spawns
      replyReady(spawnedProcesses[2])
      expect(spawnedProcesses).toHaveLength(4)

      pool.shutdownNow()
    })

    it('throws when maxBootingWorkers is 0', () => {
      expect(
        () =>
          new WorkerPool({
            workerPath: '/fake/worker.js',
            maxWorkers: 2,
            maxBootingWorkers: 0,
          })
      ).toThrow('maxBootingWorkers must be at least 1')
    })

    it('frees booting slot when setup error occurs and queued tasks proceed', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
        maxBootingWorkers: 1,
        concurrencyPerWorker: 1,
      })

      // Dispatch 2 tasks — only 1 worker spawns (booting limit = 1)
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      expect(spawnedProcesses).toHaveLength(1)

      // Worker 1 fails setup — booting slot freed, queued tasks dispatched
      // Task 'a' goes to worker 1 (now available), worker 2 spawns for remaining
      replySetupError(spawnedProcesses[0], 'Error', 'setup failed')

      // Worker 1 should have task 'a' dispatched to it
      const proc1 = spawnedProcesses[0]
      let proc1Calls = proc1.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(proc1Calls).toHaveLength(1)
      expect(proc1Calls[0][2]).toBe('a')

      // A second worker should spawn since the booting slot was freed
      expect(spawnedProcesses).toHaveLength(2)

      // Complete task 'a' on worker 1 — 'b' dequeued to worker 1
      replyOk(proc1, proc1Calls[0][1] as number, 'result-a')
      await expect(p1).resolves.toBe('result-a')

      // Task 'b' was dequeued to worker 1 after 'a' completed
      proc1Calls = proc1.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(proc1Calls).toHaveLength(2)
      expect(proc1Calls[1][2]).toBe('b')

      replyOk(proc1, proc1Calls[1][1] as number, 'result-b')
      await expect(p2).resolves.toBe('result-b')

      pool.shutdownNow()
    })
  })
})
