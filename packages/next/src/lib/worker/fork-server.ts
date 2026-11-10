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
 * forked worker: `send()`, `kill()`, `stdout`/`stderr` and the `message`,
 * `exit` and `error` events.
 *
 * Spawning is asynchronous: messages sent before the worker's message pipe
 * arrives are queued, and a kill before its pid is known is applied once it
 * is.
 */
export class ForkServerWorkerProcess extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  pid: number | undefined

  private _channel: Socket | undefined
  private _pendingMessages: unknown[] | undefined = []
  private _pendingKillSignal: NodeJS.Signals | undefined
  private _exited = false

  constructor(private readonly _onSettled: () => void) {
    super()
  }

  /** Same signature as `ChildProcess.send()`; the callback is never called with an error. */
  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    if (this._pendingMessages) {
      this._pendingMessages.push(message)
    } else if (this._channel && !this._channel.destroyed) {
      writeJsonLine(this._channel, message)
    }
    callback?.(null)
    return true
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (this._exited) return false
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

  /** @internal */
  _setPid(pid: number): void {
    this.pid = pid
    if (this._pendingKillSignal) {
      this.kill(this._pendingKillSignal)
    }
  }

  /** @internal */
  _setChannel(channel: WorkerChannelName, socket: Socket): void {
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

  /** @internal */
  _exit(code: number | null, signal: string | null): void {
    if (this._settle()) {
      this.emit('exit', code, signal)
    }
  }

  /**
   * Spawning failed. Like `ChildProcess`, only `error` is emitted: the
   * process never started, so it never exits.
   * @internal
   */
  _spawnError(error: Error): void {
    if (this._settle()) {
      this.emit('error', error)
    }
  }

  private _settle(): boolean {
    if (this._exited) return false
    this._exited = true
    this._channel?.destroy()
    this._onSettled()
    return true
  }
}

export class ForkServer {
  private _helper: ChildProcess | undefined
  private _workers = new Map<number, ForkServerWorkerProcess>()
  private _nextId = 0
  private _shuttingDown = false

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

    helper.on('message', (message: ForkServerResponse, handle?: Socket) => {
      this._handleMessage(message, handle)
    })
    // Failed to start or lost; `exit` follows for a started process.
    helper.on('error', () => this._handleHelperGone())
    helper.on('exit', () => this._handleHelperGone())
    helper.on('disconnect', () => this._handleHelperGone())

    // The fork server must not keep the main process alive while it isn't
    // spawning anything.
    this._updateRef()
  }

  /** Whether new workers can be spawned through the fork server */
  get isAvailable(): boolean {
    return (
      !this._shuttingDown &&
      this._helper !== undefined &&
      this._helper.connected
    )
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
    const worker = new ForkServerWorkerProcess(() => {
      this._workers.delete(id)
      this._updateRef()
    })
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
        // The helper is gone; `_handleHelperGone` settles the worker.
        this._handleHelperGone()
      }
    })
    return worker
  }

  /**
   * Stop the fork server. Workers it spawned keep running until they are told
   * to end, but their exits can no longer be reported, so shut down worker
   * pools that use the fork server first.
   */
  shutdown(): void {
    this._shuttingDown = true
    if (this._helper?.connected) {
      this._helper.disconnect()
    }
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
        const error: NodeJS.ErrnoException = new Error(message.message)
        error.code = message.code
        if (worker.pid === undefined) {
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
   * The helper is gone, so the exits of the workers it spawned can't be
   * observed anymore. Kill them and report them as killed; the pool handles
   * that like a crash and spawns replacements with `fork()`.
   */
  private _handleHelperGone(): void {
    if (this._helper === undefined) return
    this._shuttingDown = true
    for (const worker of [...this._workers.values()]) {
      worker.kill('SIGKILL')
      worker._exit(null, 'SIGKILL')
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
