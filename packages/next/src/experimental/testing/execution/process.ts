import { fork } from 'child_process'

/** Private transport for a single file's evaluated realm. Never pool this process. */
export interface TestProcessOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  input: unknown
  signal?: AbortSignal
  /** Omit only when a parent lease owns the lifetime and cancellation. */
  timeoutMs?: number
  shutdownGraceMs?: number
  onMessage: (message: unknown) => void
  onOutput?: (stream: 'stdout' | 'stderr', chunk: Buffer) => void
}

export interface TestProcessExit {
  code: number | null
  signal: NodeJS.Signals | null
  reason: 'exit' | 'cancelled' | 'timeout'
}

/**
 * Resolves only after the child exits and its output streams close. Application
 * chunks, React, and manifests are loaded by the worker, never by this parent.
 * Workers acknowledge cancellation by completing cleanup and exiting. A worker
 * blocked in synchronous code is killed with its process group after the grace
 * period. Output pipes are also disposed at that point: a descendant which has
 * escaped the group must not keep the parent's IPC/lease lifetime open forever.
 * Intentionally detached services require a separately owned parent lease.
 */
export function runTestProcess(
  workerPath: string,
  options: TestProcessOptions
): Promise<TestProcessExit> {
  const grace = options.shutdownGraceMs ?? 1000
  const timeouts =
    options.timeoutMs === undefined ? [grace] : [options.timeoutMs, grace]
  for (const value of timeouts) {
    if (!Number.isFinite(value) || value < 0 || value > 2147483647) {
      return Promise.reject(new Error('Invalid test process timeout'))
    }
  }
  if (options.signal?.aborted) {
    return Promise.resolve({ code: null, signal: null, reason: 'cancelled' })
  }
  if (process.platform === 'win32') {
    return Promise.reject(
      new Error(
        'Next test process isolation requires POSIX process groups. Windows execution is not supported yet.'
      )
    )
  }

  return new Promise((resolve, reject) => {
    const child = fork(workerPath, [], {
      cwd: options.cwd,
      env: options.env,
      // Do not inherit the coordinator's inspector port or execution hooks.
      execArgv: ['--enable-source-maps'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      serialization: 'advanced',
      // A separate group lets us reclaim ordinary descendants, including ones
      // which inherited the worker's output pipes, after the worker has exited.
      detached: true,
    })
    let reason: TestProcessExit['reason'] = 'exit'
    const failures: Error[] = []
    const recordFailure = (error: Error) => {
      if (!failures.includes(error)) failures.push(error)
    }
    let closed = false
    let killTimer: ReturnType<typeof setTimeout> | undefined

    const disposeOutput = () => {
      child.stdout!.destroy()
      child.stderr!.destroy()
    }
    const killGroup = () => {
      if (!child.pid) return
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          recordFailure(
            error instanceof Error ? error : new Error(String(error))
          )
          child.kill('SIGKILL')
        }
      }
    }

    const stop = (nextReason: TestProcessExit['reason']) => {
      if (closed || killTimer) return
      reason = nextReason
      killTimer = setTimeout(() => {
        killGroup()
        disposeOutput()
      }, grace)
      if (child.connected) {
        child.send({ type: 'cancel' }, () => {
          // Disconnects during shutdown are expected. The close event owns
          // settlement, and the grace timer still bounds a stuck worker.
        })
      }
    }
    const fail = (error: Error) => {
      recordFailure(error)
      stop(reason)
    }
    const cancel = () => stop('cancelled')
    const deadline =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => stop('timeout'), options.timeoutMs)
    options.signal?.addEventListener('abort', cancel, { once: true })

    child.on('error', fail)
    child.once('exit', () => {
      clearTimeout(deadline)
      // A successful or cooperative worker may leave descendants behind too.
      // Reclaim them while preserving already-buffered output until close.
      killGroup()
      killTimer ??= setTimeout(disposeOutput, grace)
    })
    child.on('message', (message) => {
      if (failures.length) return
      try {
        options.onMessage(message)
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
    for (const stream of ['stdout', 'stderr'] as const) {
      child[stream]!.on('data', (chunk: Buffer) => {
        if (failures.length) return
        try {
          options.onOutput?.(stream, chunk)
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)))
        }
      })
    }
    child.once('close', (code, signal) => {
      closed = true
      clearTimeout(deadline)
      clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', cancel)
      if (failures.length === 1) reject(failures[0])
      else if (failures.length > 1)
        reject(
          new AggregateError(
            failures,
            'Test process execution and cleanup failed'
          )
        )
      else resolve({ code, signal, reason })
    })
    try {
      child.send({ type: 'run', input: options.input }, (error) => {
        // A failed spawn also closes IPC; that consequence must not obscure the
        // original spawn failure. Independent process/group errors are retained.
        if (error && failures.length === 0) fail(error)
      })
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  })
}
