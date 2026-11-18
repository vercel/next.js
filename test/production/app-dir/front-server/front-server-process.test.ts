import { execFile, spawn, type ChildProcess } from 'child_process'
import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import { once } from 'events'
import { promisify } from 'util'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const execFileAsync = promisify(execFile)

// `next start` as a process: who owns the public port, startup, shutdown and
// exit codes. The suite starts `next start` itself, so it can signal it and
// pass it arguments.
describe('front-server process', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  const running = new Set<ChildProcess>()

  beforeAll(async () => {
    const { exitCode, cliOutput } = await next.build()
    if (exitCode !== 0) throw new Error(`next build failed:\n${cliOutput}`)
  })

  afterEach(() => {
    for (const child of running) {
      try {
        // The whole group, so any child goes too.
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    running.clear()
  })

  type Started = {
    child: ChildProcess
    port: number
    output: () => string
    exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  }

  function spawnNext(
    command: 'start' | 'dev',
    { args = [] }: { args?: string[] }
  ) {
    // `spawn` leaves out variables whose value is undefined.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // What `next start` sets when NODE_ENV is unset; jest sets it to `test`.
      NODE_ENV: 'production',
      PORT: undefined,
      NEXT_TELEMETRY_DISABLED: '1',
      __NEXT_TEST_MODE: 'e2e',
    }

    const child = spawn(
      process.execPath,
      [
        path.join(next.testDir, 'node_modules/next/dist/bin/next'),
        command,
        ...args,
      ],
      // Its own process group, so a test can signal the group like Ctrl+C.
      { cwd: next.testDir, env, stdio: 'pipe', detached: true }
    )
    running.add(child)
    let output = ''
    child.stdout!.on('data', (chunk) => (output += chunk))
    child.stderr!.on('data', (chunk) => (output += chunk))
    const exit = new Promise<{
      code: number | null
      signal: NodeJS.Signals | null
    }>((resolve) =>
      child.on('exit', (code, signal) => resolve({ code, signal }))
    )
    return { child, output: () => output, exit }
  }

  async function startNext(
    options: { args?: string[] } = {},
    command: 'start' | 'dev' = 'start'
  ): Promise<Started> {
    const started = spawnNext(command, {
      args: options.args ?? ['-p', '0'],
    })
    const port = await retry(
      async () => {
        const output = started.output()
        const match = /- Local:\s+http:\/\/localhost:(\d+)/.exec(output)
        if (!match || !/Ready in/.test(output)) {
          throw new Error(`next ${command} is not ready yet:\n${output}`)
        }
        return Number(match[1])
      },
      30_000,
      100
    )
    return { ...started, port }
  }

  async function getText(port: number, pathname = '/') {
    const res = await fetch(`http://localhost:${port}${pathname}`)
    return { status: res.status, text: await res.text() }
  }

  /** The processes listening on a TCP port, deduplicated. */
  async function listenersOf(port: number): Promise<number[]> {
    if (process.platform === 'linux') {
      return (await linuxListeners())
        .filter((listener) => listener.port === port)
        .map((listener) => listener.pid)
        .filter((pid, i, pids) => pids.indexOf(pid) === i)
    }
    const { stdout } = await execFileAsync('lsof', [
      '-nP',
      `-iTCP:${port}`,
      '-sTCP:LISTEN',
      '-t',
    ]).catch(() => ({ stdout: '' }))
    return [...new Set(stdout.split('\n').filter(Boolean).map(Number))]
  }

  async function childrenOf(pid: number): Promise<number[]> {
    const { stdout } = await execFileAsync('pgrep', ['-P', `${pid}`]).catch(
      () => ({ stdout: '' })
    )
    return stdout.split('\n').filter(Boolean).map(Number)
  }

  it('owns the public port itself', async () => {
    const { child, port } = await startNext()
    expect(await listenersOf(port)).toEqual([child.pid])
    expect(await childrenOf(child.pid!)).toEqual([])
    expect(await getText(port)).toMatchObject({ status: 200 })
  })

  it('exits 143 on SIGTERM', async () => {
    const { child, port, exit } = await startNext()
    expect(await getText(port)).toMatchObject({ status: 200 })
    process.kill(child.pid!, 'SIGTERM')
    expect(await exit).toEqual({ code: 143, signal: null })
  })

  it('exits 130 when the process group gets SIGINT, like Ctrl+C', async () => {
    const { child, port, exit } = await startNext()
    expect(await getText(port)).toMatchObject({ status: 200 })
    process.kill(-child.pid!, 'SIGINT')
    expect(await exit).toEqual({ code: 130, signal: null })
  })

  it('finishes an in-flight request across SIGTERM', async () => {
    const { child, port, exit } = await startNext()
    const response = getText(port, '/slow?ms=2000')
    // Let the request reach the route before the signal.
    await new Promise((resolve) => setTimeout(resolve, 500))
    process.kill(child.pid!, 'SIGTERM')
    expect(await response).toEqual({ status: 200, text: 'waited 2000' })
    expect(await exit).toEqual({ code: 143, signal: null })
  })

  it('listens on the port passed with -p', async () => {
    const port = await getFreePort()
    const started = await startNext({ args: ['-p', String(port)] })
    expect(started.port).toBe(port)
    expect(await getText(port)).toMatchObject({ status: 200 })
  })

  it('fails to start when the port is in use', async () => {
    const blocker = net.createServer()
    blocker.listen(0)
    await once(blocker, 'listening')
    const port = portOf(blocker)
    try {
      const { exit, output } = spawnNext('start', {
        args: ['-p', String(port)],
      })
      expect(await exit).toEqual({ code: 1, signal: null })
      // Printed once.
      expect(output().match(/Failed to start server/g)).toHaveLength(1)
      expect(output()).not.toContain('Ready in')
    } finally {
      blocker.close()
    }
  })

  it('honors --keepAliveTimeout on the public port', async () => {
    const { port } = await startNext({
      args: ['-p', '0', '--keepAliveTimeout', '2000'],
    })
    const idle = await measureIdleClose(port)
    expect(idle).toBeGreaterThan(1500)
    expect(idle).toBeLessThan(4000)
  })
})

function portOf(server: net.Server): number {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error(`not listening on a TCP port: ${address}`)
  }
  return address.port
}

async function getFreePort(): Promise<number> {
  const server = net.createServer()
  server.listen(0)
  await once(server, 'listening')
  const port = portOf(server)
  server.close()
  await once(server, 'close')
  return port
}

/** Milliseconds between the last response byte and the server closing. */
async function measureIdleClose(port: number): Promise<number> {
  const socket = net.connect(port, '127.0.0.1')
  let lastData = 0
  socket.on('data', () => {
    lastData = Date.now()
  })
  socket.write(
    `GET / HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: keep-alive\r\n\r\n`
  )
  await once(socket, 'close')
  return Date.now() - lastData
}

type LinuxListener = { pid: number; host: string; port: number }

/**
 * Listening TCP sockets of this user's processes, read from /proc. CI's Linux
 * runners have no lsof. /proc/net/tcp{,6} map each listening socket's inode
 * to its address; /proc/<pid>/fd links (`socket:[inode]`) map it to a process.
 */
async function linuxListeners(): Promise<LinuxListener[]> {
  const sockets = new Map<string, { host: string; port: number }>()
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    // tcp6 is missing when IPv6 is disabled.
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    const lines = text.split('\n').slice(1)
    for (const line of lines) {
      const fields = line.trim().split(/\s+/)
      // fields[3] is the state; 0A is LISTEN.
      if (fields.length < 10 || fields[3] !== '0A') continue
      const [hexHost, hexPort] = fields[1].split(':')
      sockets.set(fields[9], {
        host: formatProcHost(hexHost),
        port: parseInt(hexPort, 16),
      })
    }
  }

  const listeners: LinuxListener[] = []
  for (const entry of await fs.readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    const fds = await fs.readdir(`/proc/${entry}/fd`).catch(() => [])
    for (const fd of fds) {
      const link = await fs.readlink(`/proc/${entry}/fd/${fd}`).catch(() => '')
      const socket = sockets.get(/^socket:\[(\d+)\]$/.exec(link)?.[1] ?? '')
      if (socket) listeners.push({ pid: Number(entry), ...socket })
    }
  }
  return listeners
}

/** `0100007F` → `127.0.0.1`; an all-zero address (any IPv4 or IPv6) → `*`. */
function formatProcHost(hex: string): string {
  if (/^0+$/.test(hex)) return '*'
  if (hex.length === 8) {
    // IPv4, stored little-endian.
    return [6, 4, 2, 0].map((i) => parseInt(hex.slice(i, i + 2), 16)).join('.')
  }
  return `[${hex}]`
}
