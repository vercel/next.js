/**
 * Tests for the fork server, with real processes.
 *
 * The fork server starts its helper from the compiled `fork-server-child.js`,
 * so these tests use the compiled modules in `dist/` (run
 * `pnpm --filter=next build` first). The JSON-line framing is tested from
 * source.
 */
import { spawnSync } from 'child_process'
import type { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { PassThrough } from 'stream'
import { readJsonLines, writeJsonLine } from './json-line-channel'

const distDir = path.join(__dirname, '../../../dist/lib/worker')
const { ForkServer, ForkServerWorkerProcess } = require(
  path.join(distDir, 'fork-server')
) as typeof import('./fork-server')
const { WorkerPool, WorkerExitError } = require(
  path.join(distDir, 'worker-pool')
) as typeof import('./worker-pool')

type ForkServerInstance = NonNullable<
  ReturnType<typeof import('./fork-server').ForkServer.start>
>
type WorkerProcess = ReturnType<ForkServerInstance['spawn']>

jest.setTimeout(30_000)

// ---------------------------------------------------------------------------
// JSON-line framing
// ---------------------------------------------------------------------------
describe('json-line-channel', () => {
  /** A fake socket: `readJsonLines` only needs `setEncoding`, `on('data')` and `destroy`. */
  function createReader() {
    const socket = new PassThrough()
    const messages: unknown[] = []
    readJsonLines(socket as any, (message) => messages.push(message))
    return { socket, messages }
  }

  it('reads several messages from one chunk', () => {
    const { socket, messages } = createReader()
    socket.write('[1,"a"]\n{"b":2}\n"c"\n')
    expect(messages).toEqual([[1, 'a'], { b: 2 }, 'c'])
  })

  it('reassembles messages and multi-byte characters split across chunks', () => {
    const { socket, messages } = createReader()
    const bytes = Buffer.from(JSON.stringify({ text: 'héllo 😀 wörld' }) + '\n')
    // Split inside the 4-byte emoji and the 2-byte characters.
    const emoji = bytes.indexOf(Buffer.from('😀'))
    socket.write(bytes.subarray(0, 3))
    socket.write(bytes.subarray(3, emoji + 2))
    socket.write(bytes.subarray(emoji + 2))
    expect(messages).toEqual([{ text: 'héllo 😀 wörld' }])
  })

  it('keeps a trailing partial message until its newline arrives', () => {
    const { socket, messages } = createReader()
    socket.write('[1]\n[2')
    expect(messages).toEqual([[1]])
    socket.write(',3]\n')
    expect(messages).toEqual([[1], [2, 3]])
  })

  it('round trips strings with newlines', () => {
    const socket = new PassThrough()
    const messages: unknown[] = []
    readJsonLines(socket as any, (message) => messages.push(message))
    writeJsonLine(socket as any, ['line 1\nline 2\r\n', { nested: '\n' }])
    expect(messages).toEqual([['line 1\nline 2\r\n', { nested: '\n' }]])
  })

  it('destroys the socket on invalid JSON instead of throwing', async () => {
    const { socket, messages } = createReader()
    const error = new Promise((resolve) => socket.on('error', resolve))
    socket.write('[1]\nnot json\n[2]\n')
    expect(await error).toBeInstanceOf(SyntaxError)
    expect(messages).toEqual([[1]])
    expect(socket.destroyed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Helpers for real-process tests
// ---------------------------------------------------------------------------
const describeUnix = process.platform === 'win32' ? describe.skip : describe

let tmpDir: string
let echoWorkerPath: string
let poolWorkerPath: string

/**
 * A worker that talks over the fork server's message pipe, or over Node's IPC
 * channel when forked (the fallback when the fork server is gone).
 */
const ECHO_WORKER = `
// Spawned by the fork server or forked: both set up Node's IPC channel.
const send = (message, callback) => process.send(message, callback)
process.on('message', handle)
function handle(message) {
  switch (message.cmd) {
    case 'echo':
      send({ echo: message.value, connected: process.connected })
      break
    case 'ppid':
      send({ ppid: process.ppid })
      break
    case 'internal':
      // Node's internal messages are not emitted as 'message'.
      send({ cmd: 'NODE_TEST_INTERNAL' })
      send({ afterInternal: true })
      break
    case 'env':
      send({ env: process.env.NODE_CHANNEL_FD ?? null })
      break
    case 'log':
      process.stdout.write(message.stdout)
      process.stderr.write(message.stderr)
      break
    case 'exit':
      // Exit as soon as the last message is written to the pipe: the main
      // process may read it only after the exit was reported.
      send({ last: true }, () => process.exit(message.code))
      break
  }
}
`

const POOL_WORKER = `
exports.add = (a, b) => a + b
exports.ppid = () => process.ppid
exports.fail = () => { throw new Error('boom from worker') }
exports.crash = () => process.exit(7)
exports.channelEnv = () => process.env.NODE_CHANNEL_FD ?? null
exports.environment = () => ({
  execArgv: process.execArgv,
  myVar: process.env.MY_VAR,
  forkServerMarker: process.env.__NEXT_PRIVATE_FORK_SERVER_WORKER ?? null,
})
// Keeps the worker alive on its own, like leftover handles from user code.
exports.hold = () => {
  setInterval(() => {}, 1000)
  return process.pid
}
exports.activity = () => {
  process.send([3, { type: 'activity' }])
  return process.connected
}
`

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-fork-server-test-'))
  echoWorkerPath = path.join(tmpDir, 'echo-worker.js')
  poolWorkerPath = path.join(tmpDir, 'pool-worker.js')
  fs.writeFileSync(echoWorkerPath, ECHO_WORKER)
  fs.writeFileSync(poolWorkerPath, POOL_WORKER)
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitFor(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function nextEvent<T extends unknown[]>(
  emitter: EventEmitter,
  event: string
): Promise<T> {
  return new Promise((resolve) =>
    emitter.once(event, (...args) => resolve(args as T))
  )
}

/** Resolves with the next message that has `key`. */
function nextMessage(
  worker: WorkerProcess,
  key: string
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const onMessage = (message: Record<string, unknown>) => {
      if (key in message) {
        worker.off('message', onMessage)
        resolve(message)
      }
    }
    worker.on('message', onMessage)
  })
}

function readAll(stream: NodeJS.ReadableStream): () => string {
  let data = ''
  stream.on('data', (chunk) => (data += chunk))
  return () => data
}

const spawnOptions = () => ({
  cwd: tmpDir,
  env: { ...process.env },
  execArgv: [],
})

// ---------------------------------------------------------------------------
// ForkServerWorkerProcess exit reporting
// ---------------------------------------------------------------------------
describe('ForkServerWorkerProcess exit', () => {
  // The helper can report an exit before the main process read everything
  // the worker wrote to its message pipe. Use a stream as the pipe to control
  // the order.
  function createWorker() {
    const worker = new ForkServerWorkerProcess(
      '/unused.js',
      spawnOptions(),
      () => {}
    )
    const channel = new PassThrough()
    worker._setPid(1)
    worker._setChannel('message', channel as any)
    const events: unknown[] = []
    worker.on('message', (message) => events.push(message))
    worker.on('exit', (code, signal) => events.push({ exit: [code, signal] }))
    return { worker, channel, events }
  }

  it('reports the exit after the message pipe closed', () => {
    const { worker, channel, events } = createWorker()
    worker._exit(3, null)
    expect(events).toEqual([])
    channel.write('{"late":true}\n')
    channel.destroy()
    return new Promise<void>((resolve) =>
      setImmediate(() => {
        expect(events).toEqual([{ late: true }, { exit: [3, null] }])
        resolve()
      })
    )
  })

  it('stops waiting for the message pipe after a timeout', async () => {
    jest.useFakeTimers()
    let created: ReturnType<typeof createWorker>
    try {
      created = createWorker()
      created.worker._exit(null, 'SIGKILL')
      jest.advanceTimersByTime(999)
      expect(created.events).toEqual([])
      jest.advanceTimersByTime(1)
      expect(created.channel.destroyed).toBe(true)
    } finally {
      jest.useRealTimers()
    }
    await new Promise((resolve) => setImmediate(resolve))
    expect(created!.events).toEqual([{ exit: [null, 'SIGKILL'] }])
  })
})

// ---------------------------------------------------------------------------
// ForkServer
// ---------------------------------------------------------------------------
describeUnix('ForkServer', () => {
  let server: ForkServerInstance
  const workers: WorkerProcess[] = []

  function spawn(): WorkerProcess {
    const worker = server.spawn(echoWorkerPath, spawnOptions())
    workers.push(worker)
    return worker
  }

  beforeEach(() => {
    const started = ForkServer.start()
    if (!started) throw new Error('ForkServer.start() failed')
    server = started
  })

  afterEach(async () => {
    const helperPid = server.pid
    server.shutdown()
    for (const worker of workers.splice(0)) {
      if (worker.pid !== undefined) {
        await waitFor(() => !isAlive(worker.pid!), `worker ${worker.pid} exit`)
      }
    }
    if (helperPid !== undefined) {
      await waitFor(() => !isAlive(helperPid), 'helper exit')
    }
  })

  it('spawns workers from the helper and talks to them directly', async () => {
    const worker = spawn()
    // Sent before the message pipe arrived: queued.
    worker.send({ cmd: 'echo', value: 'early' })
    expect(await nextMessage(worker, 'echo')).toEqual({
      echo: 'early',
      connected: true,
    })
    expect(worker.pid).toEqual(expect.any(Number))

    worker.send({ cmd: 'ppid' })
    expect(await nextMessage(worker, 'ppid')).toEqual({ ppid: server.pid })
    expect(server.pid).not.toBe(process.pid)

    const payload = { text: 'ünïcödé 😀\nnext line', list: [1, null, true] }
    worker.send({ cmd: 'echo', value: payload })
    expect((await nextMessage(worker, 'echo')).echo).toEqual(payload)
  })

  it("sets up Node's IPC channel in the worker like fork() does", async () => {
    const worker = spawn()
    const messages: unknown[] = []
    worker.on('message', (message) => messages.push(message))
    // Node removes NODE_CHANNEL_FD from the environment once it set up IPC.
    worker.send({ cmd: 'env' })
    expect(await nextMessage(worker, 'env')).toEqual({ env: null })
    // Node's internal messages aren't emitted.
    worker.send({ cmd: 'internal' })
    await nextMessage(worker, 'afterInternal')
    expect(messages).toEqual([{ env: null }, { afterInternal: true }])
  })

  it('forwards stdout and stderr', async () => {
    const worker = spawn()
    const stdout = readAll(worker.stdout)
    const stderr = readAll(worker.stderr)
    worker.send({ cmd: 'log', stdout: 'to stdout\n', stderr: 'to stderr\n' })
    await waitFor(
      () => stdout() === 'to stdout\n' && stderr() === 'to stderr\n',
      'output'
    )
  })

  it('reports the exit code after the messages written before exiting', async () => {
    const worker = spawn()
    const events: unknown[] = []
    worker.on('message', (message) => events.push(message))
    const exit = new Promise<void>((resolve) =>
      worker.on('exit', (code, signal) => {
        events.push({ exit: [code, signal] })
        resolve()
      })
    )
    worker.send({ cmd: 'exit', code: 3 })
    await exit
    expect(events).toEqual([{ last: true }, { exit: [3, null] }])
  })

  it('kills workers and reports the signal', async () => {
    const worker = spawn()
    worker.send({ cmd: 'echo', value: 1 })
    await nextMessage(worker, 'echo')
    const exit = nextEvent(worker, 'exit')
    expect(worker.kill('SIGTERM')).toBe(true)
    expect(await exit).toEqual([null, 'SIGTERM'])
  })

  it('applies a kill that happens before the worker started', async () => {
    const worker = spawn()
    expect(worker.pid).toBeUndefined()
    const exit = nextEvent(worker, 'exit')
    worker.kill('SIGKILL')
    expect(await exit).toEqual([null, 'SIGKILL'])
  })

  it('emits only `error` when spawning fails', async () => {
    const worker = server.spawn(echoWorkerPath, {
      ...spawnOptions(),
      cwd: path.join(tmpDir, 'does-not-exist'),
    })
    const onExit = jest.fn()
    worker.on('exit', onExit)
    const [error] = await nextEvent<[NodeJS.ErrnoException]>(worker, 'error')
    expect(error.code).toBe('ENOENT')
    // The fork server keeps working.
    const other = spawn()
    other.send({ cmd: 'echo', value: 'still works' })
    expect((await nextMessage(other, 'echo')).echo).toBe('still works')
    expect(onExit).not.toHaveBeenCalled()
  })

  it('kills started workers and forks new ones when the helper is lost', async () => {
    const worker = spawn()
    worker.send({ cmd: 'echo', value: 1 })
    await nextMessage(worker, 'echo')
    const workerPid = worker.pid!

    const exit = nextEvent(worker, 'exit')
    process.kill(server.pid!, 'SIGKILL')
    expect(await exit).toEqual([null, 'SIGKILL'])
    await waitFor(() => !isAlive(workerPid), 'orphaned worker to be killed')
    expect(server.isAvailable).toBe(false)

    // Spawned after the helper is gone: forked from this process.
    const forked = spawn()
    forked.send({ cmd: 'ppid' })
    expect(await nextMessage(forked, 'ppid')).toEqual({ ppid: process.pid })
    forked.send({ cmd: 'echo', value: 'forked' })
    expect(await nextMessage(forked, 'echo')).toEqual({
      echo: 'forked',
      connected: true,
    })
    const forkedExit = nextEvent(forked, 'exit')
    forked.send({ cmd: 'exit', code: 0 })
    expect(await forkedExit).toEqual([0, null])
  })

  it('forks workers it had not started yet when the helper is lost', async () => {
    // Stop the helper so it can't handle the spawn request, then kill it.
    process.kill(server.pid!, 'SIGSTOP')
    const worker = spawn()
    worker.send({ cmd: 'ppid' })
    process.kill(server.pid!, 'SIGKILL')
    expect(await nextMessage(worker, 'ppid')).toEqual({ ppid: process.pid })
    const exit = nextEvent(worker, 'exit')
    worker.send({ cmd: 'exit', code: 4 })
    expect(await exit).toEqual([4, null])
  })

  it('kills running workers on shutdown', async () => {
    const worker = spawn()
    worker.send({ cmd: 'echo', value: 1 })
    await nextMessage(worker, 'echo')
    const helperPid = server.pid!
    const exit = nextEvent(worker, 'exit')
    server.shutdown()
    expect(await exit).toEqual([null, 'SIGKILL'])
    await waitFor(() => !isAlive(helperPid), 'helper exit')
    expect(server.isAvailable).toBe(false)
  })

  it('does not keep the process alive while idle', () => {
    // Start a fork server, use it once, then let the event loop drain.
    const script = `
      const { ForkServer } = require(${JSON.stringify(path.join(distDir, 'fork-server'))})
      const server = ForkServer.start()
      const worker = server.spawn(${JSON.stringify(echoWorkerPath)}, {
        cwd: process.cwd(), env: process.env, execArgv: [],
      })
      worker.on('message', (message) => {
        if (message.last) console.log('worker done')
      })
      worker.on('exit', (code) => console.log('worker exited ' + code))
      worker.send({ cmd: 'exit', code: 0 })
    `
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect(result.signal).toBeNull()
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('worker done\nworker exited 0\n')
  })
})

// ---------------------------------------------------------------------------
// WorkerPool with a fork server
// ---------------------------------------------------------------------------
describeUnix('WorkerPool with a fork server', () => {
  let server: ForkServerInstance

  beforeEach(() => {
    server = ForkServer.start()!
  })

  afterEach(() => {
    server.shutdown()
  })

  function createPool(
    options: Partial<ConstructorParameters<typeof WorkerPool>[0]> = {}
  ) {
    return new WorkerPool({
      workerPath: poolWorkerPath,
      maxWorkers: 2,
      forkServer: server,
      ...options,
    })
  }

  it('runs calls in workers spawned by the fork server', async () => {
    const pool = createPool()
    expect(
      await Promise.all([
        pool.dispatch('add', [1, 2]),
        pool.dispatch('add', [3, 4]),
      ])
    ).toEqual([3, 7])
    expect(await pool.dispatch('ppid', [])).toBe(server.pid)
    expect(await pool.shutdown()).toEqual({ forceExited: false })
  })

  it('propagates errors thrown by worker methods', async () => {
    const pool = createPool()
    await expect(pool.dispatch('fail', [])).rejects.toThrow('boom from worker')
    // The worker keeps serving calls.
    expect(await pool.dispatch('add', [2, 2])).toBe(4)
    await pool.shutdown()
  })

  it('reports crashes and replaces the crashed worker', async () => {
    const onWorkerExit = jest.fn()
    const pool = createPool({ maxWorkers: 1, onWorkerExit })
    const crash = pool.dispatch('crash', [])
    await expect(crash).rejects.toBeInstanceOf(WorkerExitError)
    await expect(crash).rejects.toMatchObject({ code: 7, signal: null })
    expect(onWorkerExit).toHaveBeenCalledWith(7, null)
    expect(await pool.dispatch('add', [5, 5])).toBe(10)
    await pool.shutdown()
  })

  it('provides process.send() to code in the worker', async () => {
    const onCustomMessage = jest.fn()
    const pool = createPool({ onCustomMessage })
    // `process.connected` is true while the worker is connected.
    expect(await pool.dispatch('activity', [])).toBe(true)
    expect(onCustomMessage).toHaveBeenCalledWith({ type: 'activity' })
    await pool.shutdown()
  })

  it('leaves no worker processes behind after shutdown', async () => {
    const pool = createPool()
    const pids = await Promise.all([
      pool.dispatch('ppid', []),
      pool.dispatch('ppid', []),
    ])
    expect(pids).toEqual([server.pid, server.pid])
    const children = spawnSync('pgrep', ['-P', String(server.pid)], {
      encoding: 'utf8',
    })
      .stdout.trim()
      .split('\n')
      .filter(Boolean)
      .map(Number)
    expect(children.length).toBeGreaterThan(0)
    await pool.shutdown()
    await waitFor(
      () => children.every((pid) => !isAlive(pid)),
      'workers to exit'
    )
  })

  it('does not pass the channel fd on to processes started by workers', async () => {
    const pool = createPool()
    // Node removes it from the environment once it set up IPC.
    expect(await pool.dispatch('channelEnv', [])).toBeNull()
    await pool.shutdown()
  })

  it('passes the same environment and Node options as fork()', async () => {
    const forkOptions = {
      env: { MY_VAR: 'hello' },
      execArgv: ['--max-old-space-size=512'],
    }
    const viaForkServer = createPool({ forkOptions })
    const forked = createPool({ forkOptions, forkServer: undefined })
    const expected = {
      execArgv: ['--max-old-space-size=512'],
      myVar: 'hello',
      forkServerMarker: null,
    }
    expect(await viaForkServer.dispatch('environment', [])).toEqual(expected)
    expect(await forked.dispatch('environment', [])).toEqual(expected)
    expect(await viaForkServer.dispatch('ppid', [])).toBe(server.pid)
    expect(await forked.dispatch('ppid', [])).toBe(process.pid)
    await Promise.all([viaForkServer.shutdown(), forked.shutdown()])
  })

  it('workers exit when the main process dies', async () => {
    // A main process that starts a worker which would stay alive on its own,
    // then gets killed without shutting anything down.
    const script = `
      const { ForkServer } = require(${JSON.stringify(path.join(distDir, 'fork-server'))})
      const { WorkerPool } = require(${JSON.stringify(path.join(distDir, 'worker-pool'))})
      const forkServer = ForkServer.start()
      const pool = new WorkerPool({
        workerPath: ${JSON.stringify(poolWorkerPath)},
        maxWorkers: 1,
        forkServer,
      })
      pool.dispatch('hold', []).then((pid) => {
        console.log(JSON.stringify({ worker: pid, helper: forkServer.pid }))
        process.kill(process.pid, 'SIGKILL')
      })
    `
    // Not `node -e`: workers inherit `process.execArgv`, which would contain it.
    const scriptPath = path.join(tmpDir, 'main-process.js')
    fs.writeFileSync(scriptPath, script)
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: tmpDir,
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect({
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toMatchObject({ signal: 'SIGKILL' })
    const { worker, helper } = JSON.parse(result.stdout)
    await waitFor(() => !isAlive(worker), 'worker to exit')
    await waitFor(() => !isAlive(helper), 'helper to exit')
  })
})
