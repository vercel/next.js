import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { Agent, request } from 'http'
import { connect } from 'net'
import { promises as fs } from 'fs'
import { join } from 'path'

// @force-gate turbopack && (linux || macos)
describe('Go worker boundary', () => {
  const { next } = nextTestSetup({ files: __dirname, skipDeployment: true })
  it('keeps the published frontend separate and authenticates per-request metadata', async () => {
    const response = await next.fetch('/native/identity', {
      headers: {
        'x-next-go-metadata': 'forged',
        'x-next-go-remote': '8.8.8.8',
        'x-next-go-upstream-token': 'forged',
        'x-forwarded-for': '8.8.8.8',
        'x-forwarded-host': 'evil',
        'x-forwarded-proto': 'https',
        'x-matched-path': '/js',
      },
    })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.pid).not.toBe(data.frontendPid)
    expect(data.id).toBe('identity')
    expect(data.remote).toMatch(/127\.0\.0\.1|\[::1\]/)
    expect(['127.0.0.1', '::1']).toContain(data.headers['X-Forwarded-For'][0])
    expect(data.headers['X-Forwarded-Proto']).toEqual(['http'])
    expect(
      Object.keys(data.headers).some((key) =>
        key.toLowerCase().startsWith('x-next-go-')
      )
    ).toBe(false)
    expect(data.headers['X-Matched-Path']).toBeUndefined()
    const manifest = JSON.parse(
      await next.readFile('.next/server/go-server.json')
    )
    expect(manifest.version).toBe(2)
    expect(manifest.frontend).toBe('go-front')
    expect(manifest.workers[0].protocol).toBe('next-worker-http/1')
  })
  it('selects native and Node backends on one reused connection, including after a body', async () => {
    const agent = new Agent({ keepAlive: true, maxSockets: 1 })
    try {
      for (const [path, method, body] of [
        ['/native/body', 'POST', 'hello'],
        ['/js', 'GET', ''],
        ['/native/again', 'GET', ''],
      ]) {
        const value = await new Promise<any>((resolve, reject) => {
          const req = request(next.url + path, { method, agent }, (res) => {
            let text = ''
            res.on('data', (chunk) => (text += chunk))
            res.on('end', () => resolve(JSON.parse(text)))
            res.on('error', reject)
          })
          req.on('error', reject)
          req.end(body)
        })
        if (path === '/js') expect(value.language).toBe('js')
        else expect(value.id).toBe(path.split('/').pop())
      }
    } finally {
      agent.destroy()
    }
  })
  it('streams trailers and cancels application work on disconnect', async () => {
    await new Promise<void>((resolve, reject) => {
      request(next.url + '/native/stream', (res) => {
        let body = ''
        res.on('data', (chunk) => (body += chunk))
        res.on('end', () => {
          try {
            expect(body).toBe('firstsecond')
            expect(res.trailers['x-finished']).toBe('yes')
            resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
        .on('error', reject)
        .end()
    })
    await new Promise<void>((resolve, reject) => {
      request(next.url + '/native/cancel', (res) => {
        res.once('data', () => {
          res.destroy()
          resolve()
        })
      })
        .on('error', reject)
        .end()
    })
    await retry(async () =>
      expect(await next.readFile('cancelled')).toBe('yes')
    )
  })
  it('rejects ambiguous pipelined framing without dispatching the following request', async () => {
    const port = new URL(next.url).port
    const text = await new Promise<string>((resolve, reject) => {
      const socket = connect(Number(port), '127.0.0.1')
      let result = ''
      socket.on('connect', () =>
        socket.write(
          'POST /native/body HTTP/1.1\r\nHost: example.test\r\nContent-Length: 0\r\nContent-Length: 0\r\n\r\nGET /native/smuggled HTTP/1.1\r\nHost: example.test\r\n\r\n'
        )
      )
      socket.on('data', (chunk) => (result += chunk))
      socket.on('end', () => resolve(result))
      socket.on('error', reject)
    })
    expect(text).toContain('400')
    expect(text).not.toContain('smuggled')
  })
  it('recompiles user handlers while preserving the shipped frontend bytes', async () => {
    const frontend = await fs.readFile(
      join(next.testDir, '.next/server/go-front')
    )
    const before = JSON.parse(
      await next.readFile('.next/server/go-server.json')
    )
    await next.stop()
    await next.patchFile('app/native/[id]/route.go', (source) =>
      source.replace('"id": r.PathValue("id")', '"id": "changed"')
    )
    await next.start()
    const after = JSON.parse(await next.readFile('.next/server/go-server.json'))
    expect(after.workers[0].executable).not.toBe(before.workers[0].executable)
    expect(
      await fs.readFile(join(next.testDir, '.next/server/go-front'))
    ).toEqual(frontend)
    expect((await (await next.fetch('/native/identity')).json()).id).toBe(
      'changed'
    )
  })
})

// @force-gate turbopack && windows
describe('Go frontend unsupported platform', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  it('rejects Windows instead of silently choosing a different native transport', async () => {
    const result = await next.build()
    expect(result.exitCode).not.toBe(0)
    expect(result.cliOutput).toContain('supports Linux and macOS')
  })
})
