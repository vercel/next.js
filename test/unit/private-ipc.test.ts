import { execFile } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { promisify } from 'util'

type PrivateIpc = typeof import('next/dist/server/lib/private-ipc')

const modulePath = require.resolve('next/dist/server/lib/private-ipc')
const execFileAsync = promisify(execFile)

/**
 * A fresh copy of the module, which creates its directory once per process,
 * loaded as if running on `platform`.
 */
function loadOn(platform: NodeJS.Platform): PrivateIpc {
  Object.defineProperty(process, 'platform', { value: platform })
  let loaded: PrivateIpc | undefined
  jest.isolateModules(() => {
    loaded = require(modulePath)
  })
  return loaded!
}

function request(socketPath: string, agent?: http.Agent) {
  return new Promise<{ status: number; body: string; connections: number }>(
    (resolve, reject) => {
      const req = http.get(
        { socketPath, path: '/hello', agent: agent ?? false },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () =>
            resolve({
              status: res.statusCode!,
              body,
              connections: Number(res.headers['x-connections']),
            })
          )
        }
      )
      req.on('error', reject)
    }
  )
}

describe('private IPC sockets', () => {
  const platform = process.platform
  const servers: http.Server[] = []

  afterEach(async () => {
    Object.defineProperty(process, 'platform', { value: platform })
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise((resolve) => {
            server.closeAllConnections()
            server.close(resolve)
          })
      )
    )
  })

  /** An HTTP server on loopback TCP that answers with its connection count. */
  function startServer(): Promise<http.Server> {
    let connections = 0
    const server = http.createServer((req, res) => {
      res.setHeader('x-connections', String(connections))
      res.end(`${req.method} ${req.url}`)
    })
    server.on('connection', () => connections++)
    servers.push(server)
    return new Promise((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve(server))
    )
  }

  it('only uses Unix sockets on Linux for now', () => {
    expect([...loadOn('linux').UNIX_SOCKET_PLATFORMS]).toEqual(['linux'])
    for (const other of ['darwin', 'win32', 'freebsd'] as const) {
      expect(loadOn(other).privateSocketPath('node.sock')).toBeUndefined()
    }
  })

  it('puts every socket of a process in one directory only its user can open', () => {
    const ipc = loadOn('linux')
    const first = ipc.privateSocketPath('node.sock')!
    const second = ipc.privateSocketPath('route-1.sock')!
    expect(path.basename(first)).toBe('node.sock')
    expect(path.dirname(second)).toBe(path.dirname(first))
    expect(path.basename(path.dirname(first))).toMatch(/^next-/)
    expect(fs.statSync(path.dirname(first)).mode & 0o777).toBe(0o700)
  })

  it('only offers paths that fit in a socket address', () => {
    expect(ipc().socketPathFits('/' + 'a'.repeat(106), 'linux')).toBe(true)
    expect(ipc().socketPathFits('/' + 'a'.repeat(107), 'linux')).toBe(false)
    expect(ipc().socketPathFits('/' + 'a'.repeat(102), 'darwin')).toBe(true)
    expect(ipc().socketPathFits('/' + 'a'.repeat(103), 'darwin')).toBe(false)
    expect(
      loadOn('linux').privateSocketPath('a'.repeat(120) + '.sock')
    ).toBeUndefined()

    function ipc() {
      return loadOn(platform)
    }
  })

  it('removes the directory when the process exits', async () => {
    const script = `
      Object.defineProperty(process, 'platform', { value: 'linux' })
      const { privateSocketPath } = require(${JSON.stringify(modulePath)})
      const socketPath = privateSocketPath('node.sock')
      require('fs').writeFileSync(socketPath, '')
      console.log(socketPath)
    `
    const { stdout } = await execFileAsync(process.execPath, ['-e', script])
    const socketPath = stdout.trim()
    expect(socketPath).toMatch(/node\.sock$/)
    expect(fs.existsSync(path.dirname(socketPath))).toBe(false)
  })

  it("serves the server's requests on the socket, with keep-alive", async () => {
    const ipc = loadOn('linux')
    const server = await startServer()
    const socket = (await ipc.listenOnPrivateSocket(server, 'node.sock'))!
    expect(socket.path).toBe(ipc.privateSocketPath('node.sock'))

    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
    try {
      const first = await request(socket.path, agent)
      const second = await request(socket.path, agent)
      expect(first).toEqual({ status: 200, body: 'GET /hello', connections: 1 })
      // The second request reused the first one's connection.
      expect(second.connections).toBe(1)
    } finally {
      agent.destroy()
    }
  })

  it("applies the server's own connection handling", async () => {
    const ipc = loadOn('linux')
    const server = await startServer()
    const socket = (await ipc.listenOnPrivateSocket(server, 'node.sock'))!
    const agent = new http.Agent({ keepAlive: true })
    try {
      const connection = new Promise<import('net').Socket>((resolve) =>
        server.once('connection', resolve)
      )
      await request(socket.path, agent)
      const closed = new Promise((resolve) =>
        connection.then((c) => c.once('close', resolve))
      )
      // The server tracks connections from the socket like its own, so
      // closing its idle connections closes this one too.
      server.closeIdleConnections()
      await closed
    } finally {
      agent.destroy()
    }
  })

  it('stops accepting and removes the socket file on close', async () => {
    const ipc = loadOn('linux')
    const server = await startServer()
    const socket = (await ipc.listenOnPrivateSocket(server, 'node.sock'))!
    await socket.close()
    expect(fs.existsSync(socket.path)).toBe(false)
    await expect(request(socket.path)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('falls back when it cannot listen on the socket', async () => {
    const ipc = loadOn('linux')
    const server = await startServer()
    fs.writeFileSync(ipc.privateSocketPath('taken.sock')!, '')
    expect(await ipc.listenOnPrivateSocket(server, 'taken.sock')).toBe(
      undefined
    )
  })

  it('falls back where Unix sockets are off', async () => {
    const ipc = loadOn('darwin')
    const server = await startServer()
    expect(await ipc.listenOnPrivateSocket(server, 'node.sock')).toBe(undefined)
  })
})
