import { execFile, spawn, type ChildProcess } from 'child_process'
import fs from 'fs/promises'
import http from 'http'
import net from 'net'
import path from 'path'
import { once } from 'events'
import { promisify } from 'util'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  SWITCHYARD_BINARY_ENV,
  SWITCHYARD_ENV,
} from 'next/dist/server/lib/switchyard-env'

const execFileAsync = promisify(execFile)
const FLAG = SWITCHYARD_ENV

// The processes `next start` runs with and without
// __NEXT_EXPERIMENTAL_SWITCHYARD: who owns the public port, startup and
// shutdown, and what happens when one of the processes dies. The suite starts
// `next start` itself, so it sets the variable per test and ignores the value
// it inherits.
describe('switchyard process', () => {
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
        // The whole group, so a switchyard child goes too.
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
    {
      flag,
      args = [],
      env: extraEnv = {},
    }: {
      flag: string | undefined
      args?: string[]
      env?: Readonly<Record<string, string>>
    }
  ) {
    // `spawn` leaves out variables whose value is undefined.
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // What `next start` sets when NODE_ENV is unset; jest sets it to `test`.
      NODE_ENV: 'production',
      PORT: undefined,
      NEXT_TELEMETRY_DISABLED: '1',
      __NEXT_TEST_MODE: 'e2e',
      [FLAG]: flag,
      ...extraEnv,
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
    options: { flag: string | undefined; args?: string[] },
    command: 'start' | 'dev' = 'start'
  ): Promise<Started> {
    const started = spawnNext(command, {
      ...options,
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

  /** The addresses a process listens on, like `127.0.0.1:51234` or `*:3000`. */
  async function listenAddressesOf(pid: number): Promise<string[]> {
    if (process.platform === 'linux') {
      return [
        ...new Set(
          (await linuxListeners())
            .filter((listener) => listener.pid === pid)
            .map((listener) => `${listener.host}:${listener.port}`)
        ),
      ]
    }
    const { stdout } = await execFileAsync('lsof', [
      '-nP',
      '-a',
      `-p${pid}`,
      '-iTCP',
      '-sTCP:LISTEN',
      '-Fn',
    ]).catch(() => ({ stdout: '' }))
    return [
      ...new Set(
        stdout
          .split('\n')
          .filter((line) => line.startsWith('n'))
          .map((line) => line.slice(1))
      ),
    ]
  }

  async function commandOf(pid: number): Promise<string> {
    const { stdout } = await execFileAsync('ps', [
      '-o',
      'comm=',
      '-p',
      `${pid}`,
    ])
    return path.basename(stdout.trim())
  }

  async function childrenOf(pid: number): Promise<number[]> {
    const { stdout } = await execFileAsync('pgrep', ['-P', `${pid}`]).catch(
      () => ({ stdout: '' })
    )
    return stdout.split('\n').filter(Boolean).map(Number)
  }

  async function switchyardOf(nodePid: number): Promise<number> {
    for (const pid of await childrenOf(nodePid)) {
      if ((await commandOf(pid)).startsWith('switchyard')) return pid
    }
    throw new Error(`next start (pid ${nodePid}) has no switchyard child`)
  }

  function isAlive(pid: number) {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  describe.each([undefined, '', '0', 'false'])(`with ${FLAG}=%p`, (flag) => {
    it('lets Node own the public port', async () => {
      const { child, port } = await startNext({ flag })
      expect(await listenersOf(port)).toEqual([child.pid])
      expect(await childrenOf(child.pid!)).toEqual([])
      expect(await getText(port)).toMatchObject({ status: 200 })
    })
  })

  it('fails clearly when it finds no switchyard binary', async () => {
    const missing = path.join(next.testDir, 'no-such-switchyard')
    const { exit, output } = spawnNext('start', {
      flag: '1',
      args: ['-p', '0'],
      env: { [SWITCHYARD_BINARY_ENV]: missing },
    })
    expect(await exit).toEqual({ code: 1, signal: null })
    expect(output()).toContain(
      `${SWITCHYARD_BINARY_ENV} points at ${missing}, which doesn't exist`
    )
    expect(output()).not.toContain('Ready in')
  })

  // Behavior that must not change when Switchyard is on.
  function unchangedBehavior(flag: string | undefined) {
    it('exits 143 on SIGTERM', async () => {
      const { child, port, exit } = await startNext({ flag })
      expect(await getText(port)).toMatchObject({ status: 200 })
      process.kill(child.pid!, 'SIGTERM')
      expect(await exit).toEqual({ code: 143, signal: null })
    })

    it('exits 130 when the process group gets SIGINT, like Ctrl+C', async () => {
      const { child, port, exit } = await startNext({ flag })
      expect(await getText(port)).toMatchObject({ status: 200 })
      process.kill(-child.pid!, 'SIGINT')
      expect(await exit).toEqual({ code: 130, signal: null })
    })

    it('finishes an in-flight request across SIGTERM', async () => {
      const { child, port, exit } = await startNext({ flag })
      const response = getText(port, '/slow?ms=2000')
      // Let the request reach the route before the signal.
      await new Promise((resolve) => setTimeout(resolve, 500))
      process.kill(child.pid!, 'SIGTERM')
      expect(await response).toEqual({ status: 200, text: 'waited 2000' })
      expect(await exit).toEqual({ code: 143, signal: null })
    })

    it('never answers with a server error while shutting down', async () => {
      const { child, port, exit } = await startNext({ flag })
      expect(await getText(port)).toMatchObject({ status: 200 })
      // Requests keep coming, each on a new connection, while the server
      // shuts down. Each must either be answered normally or be refused
      // once the server stops accepting, as with plain next start. A 5xx
      // would mean a request was accepted and then couldn't be served.
      const statuses: number[] = []
      let stopped = false
      const keepRequesting = async () => {
        while (!stopped) {
          try {
            statuses.push(await statusOnNewConnection(port))
          } catch {
            // Refused or reset: the server no longer accepts connections.
            return
          }
        }
      }
      const workers = Array.from({ length: 16 }, keepRequesting)
      await new Promise((resolve) => setTimeout(resolve, 300))
      process.kill(child.pid!, 'SIGTERM')
      expect(await exit).toEqual({ code: 143, signal: null })
      stopped = true
      await Promise.all(workers)
      expect(statuses.length).toBeGreaterThan(0)
      expect(statuses.filter((status) => status >= 500)).toEqual([])
    })

    it('listens on the port passed with -p', async () => {
      const port = await getFreePort()
      const started = await startNext({ flag, args: ['-p', String(port)] })
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
          flag,
          args: ['-p', String(port)],
        })
        expect(await exit).toEqual({ code: 1, signal: null })
        // Node reports it once; Switchyard prints only the raw error.
        expect(output().match(/Failed to start server/g)).toHaveLength(1)
        expect(output()).not.toContain('Ready in')
      } finally {
        blocker.close()
      }
    })

    it('honors --keepAliveTimeout on the public port', async () => {
      const { port } = await startNext({
        flag,
        args: ['-p', '0', '--keepAliveTimeout', '2000'],
      })
      const idle = await measureIdleClose(port)
      expect(idle).toBeGreaterThan(1500)
      expect(idle).toBeLessThan(4000)
    })
  }

  describe(`with ${FLAG} unset`, () => {
    unchangedBehavior(undefined)
  })

  // Needs a switchyard build. `next` ships none unless built with
  // NEXT_BUILD_SWITCHYARD=1, so this runs where the binary is passed in.
  // @force-gate switchyardBinary
  describe(`with ${FLAG}=1`, () => {
    it('puts switchyard on the public port and Node on 127.0.0.1', async () => {
      const { child, port } = await startNext({ flag: '1' })
      const switchyard = await switchyardOf(child.pid!)
      expect(await listenersOf(port)).toEqual([switchyard])

      const nodeAddresses = await listenAddressesOf(child.pid!)
      expect(nodeAddresses).toHaveLength(1)
      expect(nodeAddresses[0]).toMatch(/^127\.0\.0\.1:\d+$/)
      expect(nodeAddresses[0]).not.toBe(`127.0.0.1:${port}`)

      const { status, text } = await getText(port)
      expect(status).toBe(200)
      expect(text).toContain('hello world')
    })

    it("passes Node's timeouts to switchyard", async () => {
      const { child } = await startNext({
        flag: '1',
        args: ['-p', '0', '--keepAliveTimeout', '65000'],
      })
      const { stdout } = await execFileAsync('ps', [
        '-o',
        'args=',
        '-p',
        `${await switchyardOf(child.pid!)}`,
      ])
      // --keepAliveTimeout for clients; Node's own headersTimeout (60 s),
      // requestTimeout (300 s) and keepAliveTimeout (5 s, minus a second for
      // the pool), which Next.js leaves at Node's defaults.
      expect(stdout).toContain(
        '--idle-timeout-ms 65000 --header-timeout-ms 60000 --request-timeout-ms 300000 --upstream-idle-ms 4000'
      )
    })

    it('exits 1 when switchyard dies', async () => {
      const { child, exit } = await startNext({ flag: '1' })
      process.kill(await switchyardOf(child.pid!), 'SIGKILL')
      expect(await exit).toEqual({ code: 1, signal: null })
    })

    it('stops switchyard when Node dies', async () => {
      const { child, exit } = await startNext({ flag: '1' })
      const switchyard = await switchyardOf(child.pid!)
      process.kill(child.pid!, 'SIGKILL')
      await exit
      await retry(() => expect(isAlive(switchyard)).toBe(false), 5_000, 100)
    })

    unchangedBehavior('1')
  })

  it('next dev ignores the variable', async () => {
    const { child, port } = await startNext({ flag: '1' }, 'dev')
    expect(await getText(port)).toMatchObject({ status: 200 })
    for (const pid of await listenersOf(port)) {
      expect(await commandOf(pid)).not.toMatch(/^switchyard/)
    }
    // `next dev` serves from a child process; neither it nor the CLI process
    // starts switchyard.
    for (const pid of [child.pid!, ...(await childrenOf(child.pid!))]) {
      for (const grandchild of await childrenOf(pid)) {
        expect(await commandOf(grandchild)).not.toMatch(/^switchyard/)
      }
    }
  })
})

function portOf(server: net.Server): number {
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error(`not listening on a TCP port: ${address}`)
  }
  return address.port
}

/** Sends GET / on a connection of its own and resolves with the status. */
function statusOnNewConnection(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: 'localhost', port, path: '/', agent: false },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode!))
        res.on('error', reject)
      }
    )
    req.on('error', reject)
  })
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
