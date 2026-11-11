/**
 * Fork server: a small helper process that spawns worker processes on behalf
 * of the main process.
 *
 * `child_process.fork()` forks the calling process. When the caller holds a
 * large heap (e.g. `next build` after Turbopack compiled in-process), every
 * fork copies and later tears down its page tables, and the copy-on-write
 * faults and TLB shootdowns it causes slow down the caller's other threads.
 * Starting the fork server while the main process is still small, and
 * spawning workers from it later, avoids forking the main process at all.
 *
 * The fork server doesn't relay messages: it hands the parent ends of each
 * worker's stdout, stderr and message pipe to the main process (IPC handle
 * passing), so the main process talks to the worker directly. Messages use
 * newline-delimited JSON, like Node's default IPC serialization.
 *
 * Only supported where pipe handles can be passed over IPC (not on Windows).
 */
import { fork, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { Socket } from 'net'
import path from 'path'
import { PassThrough } from 'stream'
import { readJsonLines, writeJsonLine } from './json-line-channel'

/**
 * Set in the environment of workers spawned by the fork server to the fd of
 * their message pipe. `worker-process-child` uses it instead of Node's IPC
 * channel.
 */
export const WORKER_CHANNEL_FD_ENV = '__NEXT_PRIVATE_WORKER_CHANNEL_FD'

/**
 * How long to wait, after a worker exited, for the rest of its messages
 * before reporting the exit. The message pipe normally closes right when the
 * worker exits, unless a process the worker started inherited it.
 */
const EXIT_DRAIN_TIMEOUT = 1000

export type WorkerChannelName = 'message' | 'stdout' | 'stderr'

/** Messages from the main process to the fork server */
export type ForkServerRequest = {
  type: 'spawn'
  id: number
  modulePath: string
  execArgv: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

/** Messages from the fork server to the main process */
export type ForkServerResponse =
  | { type: 'ready' }
  | { type: 'spawned'; id: number; pid: number }
  // Sent with the parent end of the pipe as the IPC handle
  | { type: 'channel'; id: number; channel: WorkerChannelName }
  | { type: 'exit'; id: number; code: number | null; signal: string | null }
  | { type: 'error'; id: number; message: string; code?: string }

export interface ForkServerSpawnOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  execArgv: string[]
}

/**
 * A worker process spawned by the fork server. Implements the subset of the
 * `ChildProcess` API that the worker pool uses, so the pool handles it like a
 * forked worker: `send()`, `kill()`, `pid`, `stdout`/`stderr` and the
 * `message`, `exit` and `error` events.
 *
 * Spawning is asynchronous: messages sent before the worker's message pipe
 * arrives are queued, and a kill before its pid is known is applied once it
 * is. If the fork server is lost before it spawned the worker, the worker is
 * forked from the current process instead.
 */
export class ForkServerWorkerProcess extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  pid: number | undefined

  private _channel: Socket | undefined
  private _forked: ChildProcess | undefined
  private _pendingMessages: unknown[] | undefined = []
  private _pendingKillSignal: NodeJS.Signals | undefined
  private _settled = false

  /** @internal */
  constructor(
    private readonly _modulePath: string,
    private readonly _options: ForkServerSpawnOptions,
    private readonly _onSettled: () => void
  ) {
    super()
  }

  /** Same signature as `ChildProcess.send()`; the callback is never called with an error. */
  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    if (this._forked) {
      return this._forked.send(message as any, callback ?? (() => {}))
    }
    if (this._pendingMessages) {
      this._pendingMessages.push(message)
    } else if (this._channel && !this._channel.destroyed) {
      writeJsonLine(this._channel, message)
    }
    callback?.(null)
    return true
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this._settled) return false
    if (this._forked) {
      return this._forked.kill(signal)
    }
    if (this.pid === undefined) {
      this._pendingKillSignal = signal
      return true
    }
    try {
      process.kill(this.pid, signal)
      return true
    } catch {
      return false
    }
  }

  /** Whether the fork server reported this worker as started */
  get _isSpawned(): boolean {
    return this.pid !== undefined
  }

  /** @internal */
  _setPid(pid: number): void {
    this.pid = pid
    if (this._pendingKillSignal) {
      this.kill(this._pendingKillSignal)
    }
  }

  /** @internal */
  _setChannel(channel: WorkerChannelName, socket: Socket): void {
    if (this._settled) {
      socket.destroy()
      return
    }
    if (channel === 'stdout' || channel === 'stderr') {
      socket.pipe(this[channel])
      return
    }
    this._channel = socket
    readJsonLines(socket, (message) => this.emit('message', message))
    // The worker's side closes when it exits; `exit` is reported separately.
    socket.on('error', () => {})
    const pending = this._pendingMessages!
    this._pendingMessages = undefined
    for (const message of pending) {
      writeJsonLine(socket, message)
    }
  }

  /**
   * The worker exited. Messages it wrote just before exiting may still be
   * unread, so report the exit once its message pipe closed.
   * @internal
   */
  _exit(code: number | null, signal: string | null): void {
    if (this._settled) return
    this._settled = true
    this._onSettled()
    const channel = this._channel
    if (!channel || channel.closed) {
      this.emit('exit', code, signal)
      return
    }
    const timer = setTimeout(() => channel.destroy(), EXIT_DRAIN_TIMEOUT)
    channel.once('close', () => {
      clearTimeout(timer)
      this.emit('exit', code, signal)
    })
  }

  /**
   * Spawning failed. Like `ChildProcess`, only `error` is emitted: the
   * process never started, so it never exits.
   * @internal
   */
  _spawnError(error: Error): void {
    if (this._settled) return
    this._settled = true
    this._channel?.destroy()
    this._onSettled()
    this.emit('error', error)
  }

  /**
   * The fork server is gone before it started this worker: fork it from the
   * current process instead, like the pool would without a fork server.
   * @internal
   */
  _fallBackToFork(): void {
    if (this._settled || this._forked) return
    const child = fork(this._modulePath, [], { ...this._options, silent: true })
    this._forked = child
    this.pid = child.pid
    child.stdout?.pipe(this.stdout)
    child.stderr?.pipe(this.stderr)
    child.on('message', (message) => this.emit('message', message))
    child.on('exit', (code, signal) => {
      this._settled = true
      this.emit('exit', code, signal)
    })
    child.on('error', (error) => this.emit('error', error))
    for (const message of this._pendingMessages ?? []) {
      child.send(message as any, () => {})
    }
    this._pendingMessages = undefined
    if (this._pendingKillSignal) {
      child.kill(this._pendingKillSignal)
    }
  }
}

export class ForkServer {
  private _helper: ChildProcess | undefined
  /** Workers spawned (or being spawned) by the helper, by request id */
  private _workers = new Map<number, ForkServerWorkerProcess>()
  private _nextId = 0
  private _available = false

  private constructor() {}

  /**
   * Start a fork server. Returns `undefined` where it isn't supported, so
   * callers fall back to `child_process.fork()`.
   */
  static start(): ForkServer | undefined {
    if (process.platform === 'win32') {
      return undefined
    }
    const server = new ForkServer()
    try {
      server._start()
    } catch {
      return undefined
    }
    return server
  }

  private _start(): void {
    const helper = fork(path.join(__dirname, 'fork-server-child.js'), [], {
      // The helper doesn't run user code. Don't apply the main process's Node
      // options (e.g. `--inspect`) to it; workers get their own from the
      // spawn request.
      execArgv: [],
      env: { ...process.env, NODE_OPTIONS: '' },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      serialization: 'json',
    })
    this._helper = helper
    this._available = true

    helper.on('message', (message: ForkServerResponse, handle?: Socket) => {
      this._handleMessage(message, handle)
    })
    // Failed to start, or lost.
    helper.on('error', () => this._handleHelperGone())
    helper.on('exit', () => this._handleHelperGone())
    helper.on('disconnect', () => this._handleHelperGone())

    // The fork server must not keep the main process alive while it isn't
    // spawning anything.
    this._updateRef()
  }

  /** Whether new workers can be spawned through the fork server */
  get isAvailable(): boolean {
    return this._available
  }

  /** The fork server's process id */
  get pid(): number | undefined {
    return this._helper?.pid
  }

  /**
   * Spawn `modulePath` as a worker process, like `child_process.fork()` with
   * `silent: true` would.
   */
  spawn(
    modulePath: string,
    options: ForkServerSpawnOptions
  ): ForkServerWorkerProcess {
    const id = this._nextId++
    const worker = new ForkServerWorkerProcess(modulePath, options, () => {
      this._workers.delete(id)
      this._updateRef()
    })

    if (!this._available) {
      worker._fallBackToFork()
      return worker
    }

    this._workers.set(id, worker)
    this._updateRef()
    const request: ForkServerRequest = {
      type: 'spawn',
      id,
      modulePath,
      execArgv: options.execArgv,
      cwd: options.cwd,
      env: options.env,
    }
    this._helper!.send(request, (error) => {
      if (error) {
        this._handleHelperGone()
      }
    })
    return worker
  }

  /**
   * Stop the fork server. Workers it spawned and that are still running are
   * killed, since their exits could no longer be reported; shut down worker
   * pools that use the fork server first.
   */
  shutdown(): void {
    this._available = false
    if (this._helper?.connected) {
      this._helper.disconnect()
    }
    this._handleHelperGone()
  }

  private _handleMessage(message: ForkServerResponse, handle?: Socket): void {
    if (message.type === 'ready') return
    const worker = this._workers.get(message.id)
    if (!worker) {
      handle?.destroy()
      return
    }
    switch (message.type) {
      case 'spawned':
        worker._setPid(message.pid)
        break
      case 'channel':
        if (handle) {
          worker._setChannel(message.channel, handle)
        }
        break
      case 'exit':
        worker._exit(message.code, message.signal)
        break
      case 'error': {
        if (!worker._isSpawned) {
          const error: NodeJS.ErrnoException = new Error(message.message)
          error.code = message.code
          worker._spawnError(error)
        }
        // Otherwise the worker is running (the helper never signals or
        // writes to it), and its exit is reported separately.
        break
      }
      default:
        break
    }
  }

  /**
   * The helper is gone. Workers it hadn't started yet are forked from this
   * process instead. The exits of the workers it did start can't be observed
   * anymore, so they are killed and reported as killed; the pool handles that
   * like a crash, and its replacements are forked from this process.
   */
  private _handleHelperGone(): void {
    this._available = false
    const workers = [...this._workers.values()]
    this._workers.clear()
    this._updateRef()
    for (const worker of workers) {
      if (worker._isSpawned) {
        worker.kill('SIGKILL')
        worker._exit(null, 'SIGKILL')
      } else {
        worker._fallBackToFork()
      }
    }
  }

  private _updateRef(): void {
    const helper = this._helper
    if (!helper) return
    if (this._workers.size > 0) {
      helper.ref()
      helper.channel?.ref()
    } else {
      helper.unref()
      helper.channel?.unref()
    }
  }
}
