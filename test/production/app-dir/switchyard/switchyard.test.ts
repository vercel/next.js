import http from 'http'
import net from 'net'
import os from 'os'
import { createHash, randomBytes } from 'crypto'
import { once } from 'events'
import WebSocket from 'ws'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { SWITCHYARD_ENV } from 'next/dist/server/lib/switchyard-env'
import { getHeader, rawRequest } from './raw-http'

// What `next start` does with requests that a proxy in front of it could
// change: request targets, headers, bodies, streaming, upgrades, server actions
// that call the server itself, and keep-alive. Switchyard uses Go's built-in
// reason phrases; the other expectations apply with and without Switchyard.
describe('switchyard', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  let externalServer: http.Server
  let externalUpgrades: string[]

  beforeAll(async () => {
    externalUpgrades = []
    const externalPort = await findPort()
    const wsServer = new WebSocket.Server({ noServer: true })
    externalServer = http.createServer((_req, res) => res.end('external'))
    externalServer.on('upgrade', (req, socket, head) => {
      externalUpgrades.push(req.url!)
      wsServer.handleUpgrade(req, socket, head, (client) => {
        client.send(`hello from ${req.url}`)
        client.on('message', (data) => client.send(`echo ${data}`))
      })
    })
    externalServer.listen(externalPort)
    await once(externalServer, 'listening')

    const env = { SWITCHYARD_TEST_EXTERNAL_PORT: String(externalPort) }
    const { exitCode, cliOutput } = await next.build({ env })
    if (exitCode !== 0) throw new Error(`next build failed:\n${cliOutput}`)
    await next.start({ skipBuild: true, env })
  })

  afterAll(() => {
    externalServer?.close()
  })

  async function echo(
    head: string,
    body?: Buffer
  ): Promise<{ status: number; json: any }> {
    const res = await rawRequest(Number(next.appPort), head, body)
    return {
      status: res.status,
      json: res.status === 200 ? JSON.parse(res.body.toString()) : null,
    }
  }

  describe('forwarded headers', () => {
    it('fills x-forwarded-* from the connection when the client sends none', async () => {
      const { json } = await echo(
        `GET /echo HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(json.headers).toMatchObject({
        host: `localhost:${next.appPort}`,
        'x-forwarded-host': `localhost:${next.appPort}`,
        'x-forwarded-port': String(next.appPort),
        'x-forwarded-proto': 'http',
        // Node listens on all interfaces (IPv6 and IPv4), so it reports an IPv4
        // client in its IPv4-mapped IPv6 form.
        'x-forwarded-for': '::ffff:127.0.0.1',
      })
    })

    it('keeps the x-forwarded-* and forwarded headers the client sends', async () => {
      const { json } = await echo(
        [
          'GET /echo HTTP/1.1',
          'Host: shop.example.com',
          'X-Forwarded-For: 203.0.113.7, 198.51.100.2',
          'X-Forwarded-Host: shop.example.com',
          'X-Forwarded-Port: 443',
          'X-Forwarded-Proto: https',
          'Forwarded: for=203.0.113.7;proto=https',
        ].join('\r\n')
      )
      expect(json.headers).toMatchObject({
        host: 'shop.example.com',
        'x-forwarded-for': '203.0.113.7, 198.51.100.2',
        'x-forwarded-host': 'shop.example.com',
        'x-forwarded-port': '443',
        'x-forwarded-proto': 'https',
        forwarded: 'for=203.0.113.7;proto=https',
      })
    })

    it('builds request.url from the public port, whatever the Host header says', async () => {
      const { json } = await echo(
        'GET /echo/a?b=1 HTTP/1.1\r\nHost: shop.example.com'
      )
      expect(json.url).toBe(`http://localhost:${next.appPort}/echo/a?b=1`)
    })

    it('adds no user-agent or accept-encoding the client did not send', async () => {
      const { json } = await echo(
        `GET /echo HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(json.headers['user-agent']).toBeUndefined()
      expect(json.headers['accept-encoding']).toBeUndefined()
    })

    it('passes repeated and custom headers on', async () => {
      const { json } = await echo(
        [
          'GET /echo HTTP/1.1',
          `Host: localhost:${next.appPort}`,
          'User-Agent: switchyard-test',
          'Accept-Encoding: br',
          'X-Custom: one',
          'X-Custom: two',
          'x_underscore: kept',
        ].join('\r\n')
      )
      expect(json.headers).toMatchObject({
        'user-agent': 'switchyard-test',
        'accept-encoding': 'br',
        'x-custom': 'one, two',
        x_underscore: 'kept',
      })
    })
  })

  describe('client identity', () => {
    function peerRequest(
      hostname: string,
      agent: http.Agent,
      policy = '',
      headers: http.OutgoingHttpHeaders = {}
    ) {
      return new Promise<{
        status: number
        clientPort: number
        peer: {
          remoteAddress: string
          remotePort: number
          remoteFamily: string
          connectionAddress: string
          responseAddress: string
          internalHeaderPresent: boolean
        }
      }>((resolve, reject) => {
        const request = http.get(
          {
            hostname,
            port: next.appPort,
            path: `/api/peer?policy=${policy}`,
            agent,
            headers,
          },
          (response) => {
            const clientPort = request.socket!.localPort!
            const chunks: Buffer[] = []
            response.on('data', (chunk) => chunks.push(chunk))
            response.on('error', reject)
            response.on('end', () =>
              resolve({
                status: response.statusCode!,
                clientPort,
                peer: JSON.parse(Buffer.concat(chunks).toString()),
              })
            )
          }
        )
        request.on('error', reject)
      })
    }

    it('keeps external callers out of loopback-only API routes, including forged forwarding headers', async () => {
      const external = Object.values(os.networkInterfaces())
        .flat()
        .find((address) => address?.family === 'IPv4' && !address.internal)
      if (!external)
        throw new Error('The test needs a non-loopback IPv4 address')
      const agent = new http.Agent({ keepAlive: true })
      try {
        for (const policy of ['loopback', 'forwarded']) {
          const result = await peerRequest(external.address, agent, policy, {
            'x-forwarded-for': '127.0.0.1',
          })
          expect(result.status).toBe(403)
          expect(result.peer).toEqual({
            remoteAddress: `::ffff:${external.address}`,
            remotePort: result.clientPort,
            remoteFamily: 'IPv6',
            connectionAddress: `::ffff:${external.address}`,
            responseAddress: `::ffff:${external.address}`,
            internalHeaderPresent: false,
          })
        }
      } finally {
        agent.destroy()
      }
    })

    it('keeps the correct peer on reused connections from different clients', async () => {
      const agents = [
        new http.Agent({ keepAlive: true }),
        new http.Agent({ keepAlive: true }),
      ]
      try {
        for (let round = 0; round < 3; round++) {
          const results = await Promise.all(
            agents.map((agent) => peerRequest('127.0.0.1', agent, 'loopback'))
          )
          expect(results[0].clientPort).not.toBe(results[1].clientPort)
          for (const result of results) {
            expect(result.status).toBe(200)
            expect(result.peer.remoteAddress).toBe('::ffff:127.0.0.1')
            expect(result.peer.remotePort).toBe(result.clientPort)
            expect(result.peer.internalHeaderPresent).toBe(false)
          }
        }
      } finally {
        agents.forEach((agent) => agent.destroy())
      }
    })
  })

  describe('request targets', () => {
    it.each([
      {
        target: '/echo/a%2Fb',
        slug: ['a/b'],
        pathname: '/echo/a%2Fb',
      },
      {
        target: '/echo/%C3%A9',
        slug: ['é'],
        pathname: '/echo/%C3%A9',
      },
      {
        target: '/echo/a/../b',
        slug: ['b'],
        pathname: '/echo/b',
      },
      {
        target: '/echo/a?q=%2F&r=a+b',
        slug: ['a'],
        pathname: '/echo/a',
      },
    ])('routes $target', async ({ target, slug, pathname }) => {
      const { status, json } = await echo(
        `GET ${target} HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(status).toBe(200)
      expect(json.slug).toEqual(slug)
      expect(new URL(json.url).pathname).toBe(pathname)
    })

    it('redirects a target that starts with two slashes', async () => {
      const res = await rawRequest(
        Number(next.appPort),
        `GET //echo/x HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(res.status).toBe(308)
      expect(getHeader(res, 'location')).toBe('/echo/x')
    })

    // Raw non-ASCII bytes in the target aren't covered here: Node 24.22
    // rejects them with 400 and Node 20.9 routes them, so today's behavior
    // depends on the Node version. Switchyard forwards them byte for byte
    // (packages/next/src/server/switchyard/main_test.go).
    it('rejects a malformed escape', async () => {
      const res = await rawRequest(
        Number(next.appPort),
        `GET /echo/%zz HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(res.status).toBe(400)
    })
  })

  describe('bodies', () => {
    it('streams a chunked upload', async () => {
      const chunks = [
        randomBytes(64 * 1024),
        randomBytes(1024 * 1024),
        randomBytes(7),
      ]
      const expected = Buffer.concat(chunks)
      const res = await fetch(`${next.url}/echo`, {
        method: 'POST',
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks)
              controller.enqueue(new Uint8Array(chunk))
            controller.close()
          },
        }),
        // @ts-expect-error -- required by Node's fetch for a stream body
        duplex: 'half',
      })
      const json = await res.json()
      expect(json.headers['transfer-encoding']).toBe('chunked')
      expect(json.headers['content-length']).toBeUndefined()
      expect(json.body).toEqual({
        length: expected.length,
        sha256: createHash('sha256').update(expected).digest('hex'),
      })
    })

    it('passes a large body with a content-length', async () => {
      const body = randomBytes(8 * 1024 * 1024)
      const res = await fetch(`${next.url}/echo`, {
        method: 'POST',
        body: new Uint8Array(body),
      })
      const json = await res.json()
      expect(json.headers['content-length']).toBe(String(body.length))
      expect(json.body).toEqual({
        length: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
      })
    })

    it('returns every set-cookie header and adds no content-type', async () => {
      const res = await rawRequest(
        Number(next.appPort),
        `GET /api/headers HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(res.status).toBe(200)
      expect(
        res.headers.filter(([name]) => name === 'set-cookie').map(([, v]) => v)
      ).toEqual(['a=1; Path=/', 'b=2; Path=/; HttpOnly'])
      expect(getHeader(res, 'content-type')).toBeUndefined()
      expect(res.body.toString()).toBe('no content type')
    })
  })

  describe('status line', () => {
    it.each([
      {
        query: '',
        code: 400,
        nodeReason: 'Custom Reason',
        goReason: 'Bad Request',
      },
      {
        query: '?code=413',
        code: 413,
        nodeReason: 'Payload Too Large',
        goReason: 'Request Entity Too Large',
      },
    ])(
      'returns $code with the active server’s reason phrase',
      async ({ query, code, nodeReason, goReason }) => {
        const res = await rawRequest(
          Number(next.appPort),
          `GET /api/status${query} HTTP/1.1\r\nHost: localhost:${next.appPort}`
        )
        const reason =
          process.env[SWITCHYARD_ENV] === '1' ? goReason : nodeReason
        expect(res.statusLine).toBe(`HTTP/1.1 ${code} ${reason}`)
        expect(res.body.toString()).toBe('status')
      }
    )
  })

  describe('streaming', () => {
    // Resolves with the time each chunk arrived and the time the response
    // ended, relative to the request.
    function timeChunks(pathname: string) {
      return new Promise<{
        chunks: { at: number; text: string }[]
        end: number
      }>((resolve, reject) => {
        const start = Date.now()
        const chunks: { at: number; text: string }[] = []
        http
          .get(`${next.url}${pathname}`, (res) => {
            res.setEncoding('utf8')
            res.on('data', (text) =>
              chunks.push({ at: Date.now() - start, text })
            )
            res.on('end', () => resolve({ chunks, end: Date.now() - start }))
          })
          .on('error', reject)
      })
    }

    it('sends a route handler chunk before the response ends', async () => {
      const { chunks, end } = await timeChunks('/stream-route')
      expect(chunks[0].text).toBe('first\n')
      expect(end - chunks[0].at).toBeGreaterThan(1000)
    })

    it('sends a page shell before its Suspense boundary resolves', async () => {
      const { chunks, end } = await timeChunks('/stream')
      const shell = chunks.find((chunk) => chunk.text.includes('shell content'))
      const slow = chunks.find((chunk) => chunk.text.includes('slow content'))
      expect(shell).toBeDefined()
      expect(slow).toBeDefined()
      expect(slow!.at - shell!.at).toBeGreaterThan(1000)
      expect(end).toBeGreaterThanOrEqual(slow!.at)
    })
  })

  it('proxies a WebSocket through a rewrite to an external server', async () => {
    const ws = new WebSocket(`ws://localhost:${next.appPort}/external/socket`)
    const messages: string[] = []
    ws.on('message', (data) => messages.push(String(data)))
    await once(ws, 'open')
    await retry(() => expect(messages).toEqual(['hello from /socket']))
    ws.send('ping')
    await retry(() =>
      expect(messages).toEqual(['hello from /socket', 'echo ping'])
    )
    ws.close()
    expect(externalUpgrades).toContain('/socket')
  })

  it('follows a server action redirect', async () => {
    const browser = await next.browser('/action')
    await browser.elementByCss('#submit').click()
    await retry(async () => {
      expect(await browser.elementByCss('#target').text()).toBe(
        'redirect target'
      )
    })
    expect(new URL(await browser.url()).pathname).toBe('/action/done')
  })

  // A proxy that pools connections to Node must not send a request on one
  // that Node is closing for idleness (5 s by default): a POST isn't retried,
  // so the client would see an error.
  it('answers a POST sent around when an idle connection to Node expires', async () => {
    for (const delayMs of [3900, 4600, 5000, 5400]) {
      const body = Buffer.from(`after ${delayMs}`)
      const res = await rawRequest(
        Number(next.appPort),
        `POST /echo HTTP/1.1\r\nHost: localhost:${next.appPort}\r\nContent-Length: ${body.length}`,
        body
      )
      expect({ delayMs, status: res.status }).toEqual({ delayMs, status: 200 })
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  })

  it('closes an idle keep-alive connection after about five seconds', async () => {
    const socket = net.connect(Number(next.appPort), '127.0.0.1')
    let lastData = 0
    socket.on('data', () => {
      lastData = Date.now()
    })
    socket.write(
      `GET / HTTP/1.1\r\nHost: localhost:${next.appPort}\r\nConnection: keep-alive\r\n\r\n`
    )
    await once(socket, 'close')
    expect(lastData).toBeGreaterThan(0)
    const idle = Date.now() - lastData
    // Node's default keepAliveTimeout is 5 s; newer Node versions add a short
    // buffer on top of it.
    expect(idle).toBeGreaterThan(4000)
    expect(idle).toBeLessThan(7500)
  })
})
