import { execFile, spawn, type ChildProcess } from 'child_process'
import fs from 'fs/promises'
import net from 'net'
import path from 'path'
import { once } from 'events'
import { promisify } from 'util'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const execFileAsync = promisify(execFile)
const FLAG = '__NEXT_EXPERIMENTAL_FRONT_SERVER'

// The processes `next start` runs with and without
// __NEXT_EXPERIMENTAL_FRONT_SERVER: who owns the public port, startup and
// shutdown, and what happens when one of the processes dies. The suite starts
// `next start` itself, so it sets the variable per test and ignores the value
// it inherits.
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
        // The whole group, so a next-front child goes too.
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
    { flag, args = [] }: { flag: string | undefined; args?: string[] }
  ) {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      __NEXT_TEST_MODE: 'e2e',
    }
    delete env.PORT
    delete env.NODE_ENV
    delete env[FLAG]
    if (flag !== undefined) env[FLAG] = flag

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

  async function frontOf(nodePid: number): Promise<number> {
    for (const pid of await childrenOf(nodePid)) {
      if ((await commandOf(pid)).startsWith('next-front')) return pid
    }
    throw new Error(`next start (pid ${nodePid}) has no next-front child`)
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

  describe(`with ${FLAG}=1`, () => {
    it('puts next-front on the public port and Node on 127.0.0.1', async () => {
      const { child, port } = await startNext({ flag: '1' })
      const front = await frontOf(child.pid!)
      expect(await listenersOf(port)).toEqual([front])

      const nodeAddresses = await listenAddressesOf(child.pid!)
      expect(nodeAddresses).toHaveLength(1)
      expect(nodeAddresses[0]).toMatch(/^127\.0\.0\.1:\d+$/)
      expect(nodeAddresses[0]).not.toBe(`127.0.0.1:${port}`)

      const { status, text } = await getText(port)
      expect(status).toBe(200)
      expect(text).toContain('hello world')
    })

    it('exits 1 when next-front dies', async () => {
      const { child, exit } = await startNext({ flag: '1' })
      process.kill(await frontOf(child.pid!), 'SIGKILL')
      expect(await exit).toEqual({ code: 1, signal: null })
    })

    it('stops next-front when Node dies', async () => {
      const { child, exit } = await startNext({ flag: '1' })
      const front = await frontOf(child.pid!)
      process.kill(child.pid!, 'SIGKILL')
      await exit
      await retry(() => expect(isAlive(front)).toBe(false), 5_000, 100)
    })

    it('fails clearly when the next-front binary is missing', async () => {
      const frontDir = path.join(
        next.testDir,
        'node_modules/next/dist/server/front'
      )
      const moved = `${frontDir}.moved`
      await fs.rename(frontDir, moved)
      try {
        const { exit, output } = spawnNext('start', {
          flag: '1',
          args: ['-p', '0'],
        })
        expect(await exit).toEqual({ code: 1, signal: null })
        expect(output()).toContain('next-front binary')
        expect(output()).not.toContain('Ready in')
      } finally {
        await fs.rename(moved, frontDir)
      }
    })
  })

  // Behavior that must not change when the front is on.
  describe.each([undefined, '1'])(`with ${FLAG}=%p`, (flag) => {
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
      const { port } = blocker.address() as net.AddressInfo
      try {
        const { exit, output } = spawnNext('start', {
          flag,
          args: ['-p', String(port)],
        })
        expect(await exit).toEqual({ code: 1, signal: null })
        expect(output()).toContain('Failed to start server')
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
  })

  it('next dev ignores the variable', async () => {
    const { child, port } = await startNext({ flag: '1' }, 'dev')
    expect(await getText(port)).toMatchObject({ status: 200 })
    for (const pid of await listenersOf(port)) {
      expect(await commandOf(pid)).not.toMatch(/^next-front/)
    }
    // `next dev` serves from a child process; neither it nor the CLI process
    // starts next-front.
    for (const pid of [child.pid!, ...(await childrenOf(child.pid!))]) {
      for (const grandchild of await childrenOf(pid)) {
        expect(await commandOf(grandchild)).not.toMatch(/^next-front/)
      }
    }
  })
})

async function getFreePort(): Promise<number> {
  const server = net.createServer()
  server.listen(0)
  await once(server, 'listening')
  const { port } = server.address() as net.AddressInfo
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
