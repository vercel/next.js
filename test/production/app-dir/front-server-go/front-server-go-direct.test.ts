import { execFile } from 'child_process'
import fs from 'fs/promises'
import { promisify } from 'util'
import { nextTestSetup } from 'e2e-utils'
import { FRONT_SERVER_ENV } from 'next/dist/server/lib/front-server-env'
import { rawRequest } from '../front-server/raw-http'

const execFileAsync = promisify(execFile)
// Node's process title under next start, like "next-server (v16.5.0)".
const NODE = /^next-server\b/

// Which process calls the route.go worker when next start runs behind the
// front server. The other suite checks that requests and responses are the
// same either way; this one checks that the front really skips Node for the
// requests it may, by asking the OS who owns the worker's peer socket.
//
// Needs a next-front build, passed in like in the front-server process suite.
// @force-gate frontServerBinary
describe('front-server-go direct path', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env: { [FRONT_SERVER_ENV]: '1' },
  })
  if (skipped) return

  /** The name of the process that sent the worker this request. */
  async function caller(target: string, lines: string[] = []) {
    const res = await rawRequest(
      Number(next.appPort),
      [
        `GET ${target} HTTP/1.1`,
        `Host: localhost:${next.appPort}`,
        ...lines,
      ].join('\r\n')
    )
    expect(res.status).toBe(200)
    const { remoteAddr } = JSON.parse(res.body.toString())
    const port = Number(remoteAddr.split(':').pop())
    return processName(await ownerOfLocalPort(port))
  }

  it('sends the first request through Node, which starts the worker', async () => {
    expect(await caller('/go/users/first')).toMatch(NODE)
  })

  it('then sends plain requests to the worker directly', async () => {
    // Each route.go has its own worker, started by its first request.
    for (const target of ['/go/users/warm-up', '/go/echo', '/go/files/x']) {
      await caller(target)
    }
    expect(await caller('/go/users/42?sort=asc')).toBe('next-front')
    expect(await caller('/go/echo')).toBe('next-front')
    expect(await caller('/go/files/a/b.txt')).toBe('next-front')
  })

  it('keeps sending requests Node would change to Node', async () => {
    await caller('/go/users/warm-up')
    await caller('/go/echo')
    expect(await caller('/go/users/a%20b')).toMatch(NODE)
    expect(await caller('/go/echo?a')).toMatch(NODE)
    expect(await caller('/go/echo', ['Accept-Encoding: gzip'])).toMatch(NODE)
    expect(
      await caller('/go/echo', ['X-Repeated: 1', 'X-Repeated: 2'])
    ).toMatch(NODE)
  })
})

/** The pid of the process whose TCP socket has this local port on 127.0.0.1. */
async function ownerOfLocalPort(port: number): Promise<number> {
  if (process.platform === 'linux') return linuxOwnerOfLocalPort(port)
  const { stdout } = await execFileAsync('lsof', [
    '-nP',
    `-iTCP@127.0.0.1:${port}`,
    '-sTCP:ESTABLISHED',
    '-Fpn',
  ])
  let pid = 0
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    // Both ends of the connection match; the caller's has the port first.
    if (line.startsWith(`n127.0.0.1:${port}->`)) return pid
  }
  throw new Error(`no process owns 127.0.0.1:${port}:\n${stdout}`)
}

/** Same as ownerOfLocalPort, from /proc (CI's Linux runners have no lsof). */
async function linuxOwnerOfLocalPort(port: number): Promise<number> {
  const local = `0100007F:${port.toString(16).toUpperCase().padStart(4, '0')}`
  const table = await fs.readFile('/proc/net/tcp', 'utf8')
  const row = table
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((cols) => cols[1] === local && cols[3] === '01')
  if (!row) throw new Error(`no established socket on 127.0.0.1:${port}`)
  const socket = `socket:[${row[9]}]`
  for (const entry of await fs.readdir('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    const fds = await fs.readdir(`/proc/${entry}/fd`).catch(() => [])
    for (const fd of fds) {
      if (
        (await fs.readlink(`/proc/${entry}/fd/${fd}`).catch(() => '')) ===
        socket
      ) {
        return Number(entry)
      }
    }
  }
  throw new Error(`no process owns ${socket}`)
}

async function processName(pid: number): Promise<string> {
  const { stdout } = await execFileAsync('ps', ['-o', 'comm=', '-p', `${pid}`])
  return stdout.trim().split('/').pop()!
}
