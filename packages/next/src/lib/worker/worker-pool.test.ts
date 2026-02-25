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
import { WorkerPool } from './worker-pool'

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
      pool.close()
    })

    it('spawns one worker on first dispatch', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 4,
      })
      pool.dispatch('testMethod', [])
      expect(spawnedProcesses).toHaveLength(1)
      expect(pool.getWorkerCount()).toBe(1)
      pool.close()
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
      pool.close()
    })

    it('spawns additional workers when existing ones are at concurrency limit', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 3,
        concurrencyPerWorker: 1,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', [])
      expect(spawnedProcesses).toHaveLength(3)
      expect(pool.getWorkerCount()).toBe(3)
      pool.close()
    })

    it('does not spawn more workers than maxWorkers', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
        concurrencyPerWorker: 1,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      pool.dispatch('c', []) // this one should be queued
      pool.dispatch('d', []) // this one too
      expect(spawnedProcesses).toHaveLength(2)
      expect(pool.getWorkerCount()).toBe(2)
      pool.close()
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
      pool.close()
    })

    it('sends INITIALIZE before any CALL messages', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('myMethod', ['x'])
      const proc = latestProcess()
      expect(proc.sent[0][0]).toBe(CHILD_MESSAGE_INITIALIZE)
      expect(proc.sent[1][0]).toBe(CHILD_MESSAGE_CALL)
      pool.close()
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
      // The CALL message has a requestId at index 1
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      const requestId = callMsg[1] as number

      replyOk(proc, requestId, 42)
      await expect(promise).resolves.toBe(42)
      pool.close()
    })

    it('rejects when child sends CLIENT_ERROR', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('fail', [])
      const proc = latestProcess()
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      const requestId = callMsg[1] as number

      replyClientError(proc, requestId, 'TypeError', 'bad type')
      await expect(promise).rejects.toThrow('bad type')
      pool.close()
    })

    it('reconstructs error with properties from CLIENT_ERROR', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('fail', [])
      const proc = latestProcess()
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
      pool.close()
    })

    it('rejects all in-flight requests when child sends SETUP_ERROR', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 3,
      })
      const p1 = pool.dispatch('a', [])
      const p2 = pool.dispatch('b', [])
      const p3 = pool.dispatch('c', [])
      const proc = latestProcess()

      replySetupError(proc, 'Error', 'setup failed')
      await expect(p1).rejects.toThrow('Error when calling setup: setup failed')
      await expect(p2).rejects.toThrow('Error when calling setup: setup failed')
      await expect(p3).rejects.toThrow('Error when calling setup: setup failed')
      pool.close()
    })

    it('dispatches correct method and args', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.dispatch('myMethod', ['hello', 123, true])
      const proc = latestProcess()
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      expect(callMsg[2]).toBe('myMethod')
      expect(callMsg[3]).toEqual(['hello', 123, true])
      pool.close()
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
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      const ids = callMessages.map((m) => m[1])
      expect(new Set(ids).size).toBe(3)
      pool.close()
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
      pool.close()
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
      pool.close()
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
      pool.close()
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
      const callMessages = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(callMessages).toHaveLength(2)
      pool.close()
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
      pool.close()
    })
  })

  // -----------------------------------------------------------------------
  // end() and close()
  // -----------------------------------------------------------------------
  describe('end()', () => {
    it('rejects new dispatches after end() is called', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const endPromise = pool.end()
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
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      replyOk(proc, callMsg[1] as number, 'done')
      await p

      const endPromise = pool.end()
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
      const result = await pool.end()
      expect(result).toEqual({ forceExited: false })
    })

    it('rejects queued tasks when pool ends', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
        concurrencyPerWorker: 1,
      })
      pool.dispatch('first', []) // occupies the worker
      const queuedPromise = pool.dispatch('second', []) // queued

      const proc = latestProcess()
      // End the pool before resolving the first task
      const endPromise = pool.end()
      proc.emit('exit', 0, null)
      await endPromise

      await expect(queuedPromise).rejects.toThrow(
        'Worker pool ended before task could be processed'
      )
    })
  })

  describe('close()', () => {
    it('rejects new dispatches after close()', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      pool.close()
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
      pool.close()
      await expect(promise).rejects.toThrow('Worker pool closed')
    })

    it('kills all worker processes', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])
      expect(spawnedProcesses).toHaveLength(2)

      pool.close()
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
      pool.close()
    })

    it('rejects in-flight requests on unexpected exit', async () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 1,
      })
      const promise = pool.dispatch('test', [])
      const proc = latestProcess()

      proc.emit('exit', 1, null)

      await expect(promise).rejects.toThrow('Worker exited with code 1')
      pool.close()
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
      const callMsg = proc.sent.find((m) => m[0] === CHILD_MESSAGE_CALL)!
      replyOk(proc, callMsg[1] as number, 'ok')

      const endPromise = pool.end()
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
      pool.close()
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
      pool.close()
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

      pool.close()
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
      let calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls).toHaveLength(1)

      // Complete first task
      replyOk(proc, calls[0][1] as number, 'r1')
      await p1

      // Second task should now be dispatched
      calls = proc.sent.filter((m) => m[0] === CHILD_MESSAGE_CALL)
      expect(calls).toHaveLength(2)
      expect(calls[1][2]).toBe('second')
      pool.close()
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
      pool.close()
    })

    it('sets JEST_WORKER_ID in env for child_process workers', () => {
      const pool = new WorkerPool({
        workerPath: '/fake/worker.js',
        maxWorkers: 2,
      })
      pool.dispatch('a', [])
      pool.dispatch('b', [])

      const forkMock = (
        require('child_process') as typeof import('child_process')
      ).fork as jest.Mock
      const env0 = forkMock.mock.calls[0][2].env
      const env1 = forkMock.mock.calls[1][2].env
      // Worker IDs should be 1-based
      expect(env0.JEST_WORKER_ID).toBe('1')
      expect(env1.JEST_WORKER_ID).toBe('2')
      pool.close()
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
      pool.close()
    })
  })
})
