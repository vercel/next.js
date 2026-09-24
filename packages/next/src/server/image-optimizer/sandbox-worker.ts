import type { ChildProcess, SpawnOptions } from 'child_process'
import { spawn } from 'child_process'
import { realpathSync } from 'fs'
import { dirname, resolve } from 'path'
import { getImageOptimizerSandboxConfig } from './sandbox-worker-policy'
export { getImageOptimizerSandboxConfig } from './sandbox-worker-policy'
import { ImageError } from './image-error'
import type {
  ImageOptimizerOperation,
  ImageOptimizerOperationResult,
} from './operation'
import type {
  ImageOptimizerWorkerResponse,
  SerializedImageOptimizerError,
} from './sandbox-worker-protocol'

const DEFAULT_MAX_OPERATIONS = 4
const DEFAULT_MAX_IN_FLIGHT_BYTES = 100 * 1024 * 1024
const DEFAULT_MAX_PENDING_OPERATIONS = 256
const DEFAULT_MAX_PENDING_BYTES = 256 * 1024 * 1024
const MIN_REQUEST_TIMEOUT_MS = 60_000
const WATCHDOG_GRACE_MS = 2_000
const KILL_GRACE_MS = 1_000

const shutdownHandlers = new Set<() => void>()
function killWorkers() {
  for (const shutdown of shutdownHandlers) shutdown()
}
function onSignal(signal: NodeJS.Signals) {
  killWorkers()
  // Do not swallow Node's default termination behavior in custom servers
  // that have no signal handler of their own.
  if (process.listenerCount(signal) === 1) {
    process.removeListener(signal, onSignal)
    process.kill(process.pid, signal)
  }
}
function registerShutdown(handler: () => void) {
  if (shutdownHandlers.size === 0) {
    process.prependListener('SIGINT', onSignal)
    process.prependListener('SIGTERM', onSignal)
    process.on('exit', killWorkers)
  }
  shutdownHandlers.add(handler)
}
function unregisterShutdown(handler: () => void) {
  shutdownHandlers.delete(handler)
  if (shutdownHandlers.size === 0) {
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    process.removeListener('exit', killWorkers)
  }
}

type SandboxManager =
  (typeof import('@anthropic-ai/sandbox-runtime'))['SandboxManager']

interface QueuedOperation {
  operation: ImageOptimizerOperation
  size: number
  resolve(value: ImageOptimizerOperationResult): void
  reject(error: Error): void
}

interface ActiveOperation extends QueuedOperation {
  id: number
}

interface WorkerOptions {
  workerPath?: string
  readAllowlist?: string[]
  maxOperations?: number
  maxInFlightBytes?: number
  maxPendingOperations?: number
  maxPendingBytes?: number
  requestTimeoutMs?: number
  killGraceMs?: number
  sandboxManager?: SandboxManager
}

function getRestrictedEnvironment(
  sandboxEnvironment: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  if (process.platform === 'win32') {
    return sandboxEnvironment
  }

  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: sandboxEnvironment.NODE_ENV ?? process.env.NODE_ENV,
    // Image transforms do not need host OpenSSL configuration (which may
    // itself reference secrets or additional files outside the read policy).
    OPENSSL_CONF: '/dev/null',
    // This is a no-op for an installed `node_modules/next` package. It also
    // lets the monorepo checkout resolve `next/dist/compiled/*` from the
    // package's own worker.
    NODE_PATH: dirname(resolve(__dirname, '..', '..', '..')),
  }
  for (const key of ['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ']) {
    if (sandboxEnvironment[key] !== undefined) {
      environment[key] = sandboxEnvironment[key]
    }
  }
  return environment
}

function quoteShellArgument(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'"
}

function deserializeError(serialized: SerializedImageOptimizerError): Error {
  const error = serialized.statusCode
    ? new ImageError(serialized.statusCode, serialized.message)
    : new Error(serialized.message)
  error.name = serialized.name
  if (serialized.stack) {
    error.stack = serialized.stack
  }
  if (serialized.code) {
    ;(error as Error & { code?: string }).code = serialized.code
  }
  return error
}

function getOperationSize(operation: ImageOptimizerOperation): number {
  return (
    operation.imageUpstream.buffer.byteLength +
    (operation.options.previousOutput?.buffer.byteLength ?? 0)
  )
}

export class SandboxedImageOptimizerWorker {
  private readonly workerPath: string
  private readonly readAllowlist?: string[]
  private readonly maxOperations: number
  private readonly maxInFlightBytes: number
  private readonly maxPendingOperations: number
  private readonly maxPendingBytes: number
  private readonly requestTimeoutMs?: number
  private readonly killGraceMs: number

  private sandboxManager?: SandboxManager
  private child?: ChildProcess
  private childPromise?: Promise<ChildProcess>
  private terminationPromise?: Promise<void>
  private queue: QueuedOperation[] = []
  private active = new Map<number, ActiveOperation>()
  private activeBytes = 0
  private pendingBytes = 0
  private pendingOperations = 0
  private nextId = 1
  private pumping = false
  private closed = false
  private interrupted = false
  private children = new Set<ChildProcess>()
  private shutdown = () => {
    this.interrupted = true
    // Do not wait for graceful termination: next dev can force-kill the
    // server before our normal SIGTERM-to-SIGKILL timer gets a chance to run.
    for (const child of this.children) this.signal(child, 'SIGKILL')
  }

  constructor(options: WorkerOptions = {}) {
    this.readAllowlist = options.readAllowlist?.slice()
    this.workerPath =
      options.workerPath ?? require.resolve('./sandbox-worker-child')
    this.maxOperations = options.maxOperations ?? DEFAULT_MAX_OPERATIONS
    this.maxInFlightBytes =
      options.maxInFlightBytes ?? DEFAULT_MAX_IN_FLIGHT_BYTES
    this.maxPendingOperations =
      options.maxPendingOperations ?? DEFAULT_MAX_PENDING_OPERATIONS
    this.maxPendingBytes = options.maxPendingBytes ?? DEFAULT_MAX_PENDING_BYTES
    this.requestTimeoutMs = options.requestTimeoutMs
    this.killGraceMs = options.killGraceMs ?? KILL_GRACE_MS
    this.sandboxManager = options.sandboxManager
    registerShutdown(this.shutdown)
  }

  runOperation(
    operation: ImageOptimizerOperation
  ): Promise<ImageOptimizerOperationResult> {
    if (this.closed || this.interrupted) {
      return Promise.reject(new Error('Image optimizer worker is closed'))
    }

    const size = getOperationSize(operation)
    if (
      this.pendingOperations >= this.maxPendingOperations ||
      size > this.maxPendingBytes - this.pendingBytes
    ) {
      return Promise.reject(
        new ImageError(503, 'Image optimizer worker is busy')
      )
    }

    return new Promise((resolveOperation, reject) => {
      this.pendingOperations++
      this.pendingBytes += size
      let settled = false
      const settle = () => {
        if (settled) return false
        settled = true
        clearTimeout(timeout)
        this.pendingOperations--
        this.pendingBytes -= size
        return true
      }
      const queued: QueuedOperation = {
        operation,
        size,
        resolve: (value) => {
          if (settle()) resolveOperation(value)
        },
        reject: (error) => {
          if (settle()) reject(error)
        },
      }
      const timeoutMs =
        this.requestTimeoutMs ??
        Math.max(
          MIN_REQUEST_TIMEOUT_MS,
          (operation.config.experimental.imgOptTimeoutInSeconds ?? 7) * 1_000 +
            WATCHDOG_GRACE_MS
        )
      // Include queueing and sandbox startup in the request's deadline.
      const timeout = setTimeout(() => {
        const error = new Error(
          `Image optimizer worker timed out after ${timeoutMs}ms`
        )
        const index = this.queue.indexOf(queued)
        if (index !== -1) {
          this.queue.splice(index, 1)
          queued.reject(error)
        } else if (this.child) {
          this.failChild(this.child, error)
        }
      }, timeoutMs)
      timeout.unref()
      this.queue.push(queued)
      void this.pump()
    })
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.closed || this.queue.length === 0) {
      return
    }
    this.pumping = true

    try {
      const child = await this.ensureChild()
      while (this.queue.length > 0 && !this.closed && child === this.child) {
        if (this.active.size >= this.maxOperations) {
          break
        }
        const next = this.queue[0]
        if (
          this.active.size > 0 &&
          this.activeBytes + next.size > this.maxInFlightBytes
        ) {
          break
        }
        this.queue.shift()
        this.dispatch(child, next)
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      const queued = this.queue.splice(0)
      for (const operation of queued) {
        operation.reject(failure)
      }
    } finally {
      this.pumping = false
    }
  }

  private async ensureChild(): Promise<ChildProcess> {
    if (this.terminationPromise) {
      await this.terminationPromise
      this.terminationPromise = undefined
    }
    if (this.child) {
      return this.child
    }
    if (this.childPromise) {
      return this.childPromise
    }

    this.childPromise = this.spawnChild()
    try {
      return await this.childPromise
    } finally {
      this.childPromise = undefined
    }
  }

  private async spawnChild(): Promise<ChildProcess> {
    if (this.closed || this.interrupted) {
      throw new Error('Image optimizer worker is closed')
    }
    const sandboxManager =
      this.sandboxManager ??
      (
        await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */
          '@anthropic-ai/sandbox-runtime'
        )
      ).SandboxManager
    this.sandboxManager = sandboxManager
    await sandboxManager.initialize(
      getImageOptimizerSandboxConfig(this.workerPath, this.readAllowlist)
    )

    const command = `exec ${quoteShellArgument(process.execPath)} ${quoteShellArgument(this.workerPath)}`
    const { argv, env } = await sandboxManager.wrapWithSandboxArgv(
      command,
      realpathSync('/bin/sh'),
      undefined,
      undefined
    )
    if (this.closed || this.interrupted) {
      throw new Error('Image optimizer worker is closed')
    }

    const spawnOptions: SpawnOptions = {
      cwd: __dirname,
      env: getRestrictedEnvironment(env),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      serialization: 'advanced',
      detached: process.platform !== 'win32',
    }
    const child = spawn(argv[0], argv.slice(1), spawnOptions)
    this.child = child
    this.children.add(child)
    // Keep terminating workers tracked even after this.child is cleared.
    child.once('exit', () => this.children.delete(child))
    child.once('error', () => {
      if (!child.pid) this.children.delete(child)
    })

    child.stdout?.pipe(process.stdout)
    child.stderr?.pipe(process.stderr)
    child.on('message', (message) => {
      try {
        this.handleMessage(child, message as ImageOptimizerWorkerResponse)
      } catch {
        // An unusable response must not disarm the request watchdog.
        // The deadline will kill the worker and reject all of its active work.
      }
    })
    child.once('error', (error) => this.handleChildFailure(child, error))
    child.once('exit', (code, signal) => {
      this.handleChildFailure(
        child,
        new Error(
          `Image optimizer worker exited with code ${code} and signal ${signal}`
        )
      )
    })

    return child
  }

  private dispatch(child: ChildProcess, queued: QueuedOperation): void {
    const id = this.nextId++
    this.active.set(id, { ...queued, id })
    this.activeBytes += queued.size
    try {
      child.send(
        { type: 'transform', id, operation: queued.operation },
        (error) => {
          if (error) {
            this.failChild(child, error)
          }
        }
      )
    } catch (error) {
      this.failChild(
        child,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }

  private handleMessage(
    child: ChildProcess,
    message: ImageOptimizerWorkerResponse
  ): void {
    if (
      child !== this.child ||
      !message ||
      (message.type !== 'result' && message.type !== 'error') ||
      !Number.isSafeInteger(message.id)
    ) {
      return
    }
    const operation = this.active.get(message.id)
    if (!operation) {
      return
    }

    if (message.type === 'result') {
      message.value.result.buffer = Buffer.from(message.value.result.buffer)
      operation.resolve(message.value)
    } else {
      operation.reject(deserializeError(message.error))
    }
    this.active.delete(message.id)
    this.activeBytes -= operation.size
    void this.pump()
  }

  private handleChildFailure(child: ChildProcess, error: Error): void {
    if (child !== this.child) {
      return
    }
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      this.failChild(child, error)
      return
    }
    this.child = undefined
    this.rejectActive(error)
    this.sandboxManager?.cleanupAfterCommand()
    void this.pump()
  }

  private failChild(child: ChildProcess, error: Error): void {
    if (child !== this.child) {
      return
    }
    this.rejectActive(error)
    this.child = undefined
    this.terminationPromise = new Promise<void>((resolveExit) =>
      child.once('exit', () => resolveExit())
    ).finally(() => this.sandboxManager?.cleanupAfterCommand())
    this.terminate(child)
    void this.pump()
  }

  private rejectActive(error: Error): void {
    const active = [...this.active.values()]
    this.active.clear()
    this.activeBytes = 0
    for (const operation of active) {
      operation.reject(error)
    }
  }

  private signal(child: ChildProcess, signal: NodeJS.Signals): void {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
      return
    }
    try {
      if (process.platform === 'win32') {
        child.kill(signal)
      } else {
        process.kill(-child.pid, signal)
      }
    } catch {
      child.kill(signal)
    }
  }

  private terminate(child: ChildProcess): void {
    this.signal(child, 'SIGTERM')
    const hardKill = setTimeout(
      () => this.signal(child, 'SIGKILL'),
      this.killGraceMs
    )
    hardKill.unref()
    child.once('exit', () => clearTimeout(hardKill))
  }

  async close(): Promise<void> {
    if (this.closed) {
      return
    }
    this.closed = true
    try {
      const closedError = new Error('Image optimizer worker is closed')
      for (const operation of this.queue.splice(0)) {
        operation.reject(closedError)
      }
      this.rejectActive(closedError)

      let child = this.child
      if (!child && this.childPromise) {
        child = await this.childPromise.catch(() => undefined)
      }
      this.child = undefined
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolveExit) =>
          child.once('exit', () => resolveExit())
        )
        this.terminate(child)
        await exited
      }

      await this.terminationPromise
      this.terminationPromise = undefined

      this.sandboxManager?.cleanupAfterCommand()
      await this.sandboxManager?.reset()
      this.sandboxManager = undefined
    } finally {
      unregisterShutdown(this.shutdown)
    }
  }
}
