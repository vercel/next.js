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

  it('passes hop-by-hop request headers on to the app', async () => {
    const res = await rawRequest(
      Number(next.appPort),
      `GET /api/request-headers HTTP/1.1\r\nHost: localhost:${next.appPort}\r\n` +
        'Connection: keep-alive, X-Named\r\nX-Named: named\r\n' +
        'Keep-Alive: timeout=9\r\nProxy-Authorization: Basic eA==\r\n' +
        'Proxy-Connection: keep-alive\r\nTE: trailers, gzip\r\nUpgrade: example/1'
    )
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body.toString())).toMatchObject({
      // rawRequest adds its own Connection: close.
      connection: 'keep-alive, X-Named, close',
      'x-named': 'named',
      'keep-alive': 'timeout=9',
      'proxy-authorization': 'Basic eA==',
      'proxy-connection': 'keep-alive',
      te: 'trailers, gzip',
      upgrade: 'example/1',
    })
  })

  describe('header limits', () => {
    // Node's answer to headers over its limits, byte for byte.
    const tooLarge =
      'HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n'

    // Sends a GET for /api/peer with `lines` header lines in all (Host and
    // Connection included) and returns the raw answer and the client's port.
    function requestWithLines(lines: number) {
      return new Promise<{ raw: string; clientPort: number }>(
        (resolve, reject) => {
          const socket = net.connect(Number(next.appPort), '127.0.0.1')
          let raw = ''
          socket.on('data', (chunk) => (raw += chunk.toString('latin1')))
          socket.on('error', reject)
          socket.on('connect', () => {
            const clientPort = socket.localPort!
            socket.on('end', () => resolve({ raw, clientPort }))
            socket.write(
              `GET /api/peer HTTP/1.1\r\nHost: localhost:${next.appPort}\r\nConnection: close\r\n` +
                'A: 1\r\n'.repeat(lines - 2) +
                '\r\n'
            )
          })
        }
      )
    }

    it('keeps the client address on a request with as many headers as Node reads', async () => {
      const { raw, clientPort } = await requestWithLines(1000)
      expect(raw).toMatch(/^HTTP\/1\.1 200 /)
      const peer = JSON.parse(raw.slice(raw.indexOf('\r\n\r\n') + 4))
      expect(peer.remotePort).toBe(clientPort)
      expect(peer.internalHeaderPresent).toBe(false)
    })

    // Node reads 1000 lines and drops the rest; Switchyard can't drop the
    // same ones, so it refuses the request.
    it('refuses more header lines than Node reads only with Switchyard', async () => {
      const { raw, clientPort } = await requestWithLines(1001)
      if (process.env[SWITCHYARD_ENV] === '1') {
        expect(raw).toBe(tooLarge)
      } else {
        expect(raw).toMatch(/^HTTP\/1\.1 200 /)
        const peer = JSON.parse(raw.slice(raw.indexOf('\r\n\r\n') + 4))
        expect(peer.remotePort).toBe(clientPort)
      }
    })

    it('answers 431 once the headers reach Node’s size limit', async () => {
      // Node counts the URL and each header's name and value: here
      // "/api/peer", Host, Connection: close (added by rawRequest) and X-Pad.
      const host = `localhost:${next.appPort}`
      const counted =
        '/api/peer'.length +
        'Host'.length +
        host.length +
        'Connectionclose'.length +
        'X-Pad'.length
      const send = (padding: number) =>
        rawRequest(
          Number(next.appPort),
          `GET /api/peer HTTP/1.1\r\nHost: ${host}\r\nX-Pad: ${'a'.repeat(padding)}`
        )
      expect((await send(http.maxHeaderSize - counted - 1)).status).toBe(200)
      const refused = await send(http.maxHeaderSize - counted)
      expect(refused.statusLine).toBe(
        'HTTP/1.1 431 Request Header Fields Too Large'
      )
      expect(refused.headers).toEqual([['connection', 'close']])
      expect(refused.body.length).toBe(0)
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

    it('passes the trailer fields of a chunked upload on', async () => {
      const res = await rawRequest(
        Number(next.appPort),
        `POST /api/trailers HTTP/1.1\r\nHost: localhost:${next.appPort}\r\nTransfer-Encoding: chunked\r\nTrailer: X-Checksum`,
        Buffer.from('3\r\nabc\r\n0\r\nX-Checksum: 900150983cd24fb0\r\n\r\n')
      )
      expect(res.status).toBe(200)
      expect(JSON.parse(res.body.toString())).toEqual({
        body: 'abc',
        trailers: { 'x-checksum': '900150983cd24fb0' },
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

  describe('response headers', () => {
    it('passes hop-by-hop headers the app sets on to the client', async () => {
      const res = await rawRequest(
        Number(next.appPort),
        `GET /api/hop HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(res.status).toBe(426)
      expect(getHeader(res, 'upgrade')).toBe('example/2')
      expect(getHeader(res, 'proxy-authenticate')).toBe('Basic realm="shop"')
      expect(getHeader(res, 'x-listed')).toBe('listed')
    })

    it('sends no date header when the app turns it off', async () => {
      const res = await rawRequest(
        Number(next.appPort),
        `GET /api/no-date HTTP/1.1\r\nHost: localhost:${next.appPort}`
      )
      expect(res.status).toBe(200)
      expect(getHeader(res, 'date')).toBeUndefined()
      expect(res.body.toString()).toBe('no date')
    })
  })

  describe('connections', () => {
    // Writes `request` on a new connection and resolves with everything the
    // server sent, and whether it closed the connection within a second.
    function exchange(request: string) {
      return new Promise<{ text: string; closed: boolean }>(
        (resolve, reject) => {
          const socket = net.connect(Number(next.appPort), '127.0.0.1')
          let text = ''
          const timer = setTimeout(() => {
            socket.destroy()
            resolve({ text, closed: false })
          }, 1000)
          socket.on('data', (chunk) => (text += chunk.toString('latin1')))
          socket.on('error', reject)
          socket.on('close', () => {
            clearTimeout(timer)
            resolve({ text, closed: true })
          })
          socket.write(request)
        }
      )
    }
    const host = () => `Host: localhost:${next.appPort}\r\n`

    it('says keep-alive and how long, as Node does', async () => {
      const { text, closed } = await exchange(
        `GET /api/sized HTTP/1.1\r\n${host()}\r\n`
      )
      expect(text).toMatch(/\r\nconnection: keep-alive\r\n/i)
      expect(text).toMatch(/\r\nkeep-alive: timeout=5\r\n/i)
      expect(closed).toBe(false)
    })

    it('closes the connection after a response the app asks to close it after', async () => {
      const { text, closed } = await exchange(
        `GET /api/close HTTP/1.1\r\n${host()}\r\nGET /api/sized HTTP/1.1\r\n${host()}\r\n`
      )
      expect(text).toMatch(/\r\nconnection: close\r\n/i)
      expect(text).toContain('closing')
      // Only the first request is answered.
      expect(text.match(/HTTP\/1\.1 /g)).toHaveLength(1)
      expect(closed).toBe(true)
    })

    it('closes the connection without an answer when the app drops it', async () => {
      const { text, closed } = await exchange(
        `POST /api/drop HTTP/1.1\r\n${host()}Content-Length: 1\r\n\r\nx`
      )
      expect(text).toBe('')
      expect(closed).toBe(true)
    })

    it('keeps the connection after an answer that came before the upload ended', async () => {
      const socket = net.connect(Number(next.appPort), '127.0.0.1')
      let text = ''
      socket.on('data', (chunk) => (text += chunk.toString('latin1')))
      try {
        const body = Buffer.alloc(200_000, 'a')
        socket.write(
          `POST /api/early HTTP/1.1\r\n${host()}Content-Length: ${body.length}\r\n\r\n`
        )
        await retry(() => expect(text).toContain('refused'))
        expect(text).toMatch(/^HTTP\/1\.1 403 /)
        expect(text).not.toMatch(/\r\nconnection: close\r\n/i)
        // The rest of the upload, then another request on the same connection.
        socket.write(body)
        socket.write(`GET /api/sized HTTP/1.1\r\n${host()}\r\n`)
        await retry(() => expect(text.endsWith('sized')).toBe(true))
        expect(text.match(/HTTP\/1\.1 /g)).toHaveLength(2)
      } finally {
        socket.destroy()
      }
    })

    // Writes `request`, stops sending (a half-close), and resolves with what
    // the server sent before it closed the connection.
    function sendThenStopSending(request: string) {
      return new Promise<string>((resolve, reject) => {
        const socket = net.connect(Number(next.appPort), '127.0.0.1')
        let text = ''
        socket.on('data', (chunk) => (text += chunk.toString('latin1')))
        socket.on('error', reject)
        socket.on('close', () => resolve(text))
        socket.end(request)
      })
    }

    it('answers a client that stops sending after its request, when the answer is ready at once', async () => {
      const text = await sendThenStopSending(
        `GET /api/sized HTTP/1.1\r\n${host()}\r\n`
      )
      expect(text).toMatch(/^HTTP\/1\.1 200 /)
      expect(text.endsWith('sized')).toBe(true)
    })

    // Node drops an answer that isn't ready by the time the client stops
    // sending; Switchyard still delivers it (README.md, "Half-closed
    // connections").
    it('delivers a slower answer to a client that stops sending only with Switchyard', async () => {
      const text = await sendThenStopSending(
        `GET /slow?ms=500 HTTP/1.1\r\n${host()}\r\n`
      )
      if (process.env[SWITCHYARD_ENV] === '1') {
        expect(text).toMatch(/^HTTP\/1\.1 200 /)
        expect(text).toContain('waited 500')
      } else {
        expect(text).toBe('')
      }
    })

    it('closes the connection at once when the app drops it during an upload', async () => {
      // 10 bytes announced, 1 sent, and the client then waits.
      const { text, closed } = await exchange(
        `POST /api/drop-upload HTTP/1.1\r\n${host()}Content-Length: 10\r\n\r\nx`
      )
      expect(text).toBe('')
      expect(closed).toBe(true)
    })

    it('closes the connection without an answer for an upgrade to a page', async () => {
      const { text, closed } = await exchange(
        `GET / HTTP/1.1\r\n${host()}Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n`
      )
      expect(text).toBe('')
      expect(closed).toBe(true)
    })
  })

  describe('HTTP/1.0 clients', () => {
    // Sends a raw HTTP/1.0 request asking for keep-alive and reports what came
    // back, and whether the server closed the connection within a second.
    function keepAliveRequest(pathname: string) {
      return new Promise<{ text: string; closed: boolean }>(
        (resolve, reject) => {
          const socket = net.connect(Number(next.appPort), '127.0.0.1')
          let text = ''
          const timer = setTimeout(() => {
            socket.destroy()
            resolve({ text, closed: false })
          }, 1000)
          socket.on('data', (chunk) => (text += chunk.toString('latin1')))
          socket.on('error', reject)
          socket.on('end', () => {
            clearTimeout(timer)
            resolve({ text, closed: true })
          })
          socket.write(
            `GET ${pathname} HTTP/1.0\r\nHost: localhost:${next.appPort}\r\nConnection: keep-alive\r\n\r\n`
          )
        }
      )
    }

    it('closes the connection after a response of unknown length', async () => {
      const { text, closed } = await keepAliveRequest('/api/no-date')
      expect(text).toMatch(/\r\nconnection: close\r\n/i)
      expect(text.endsWith('no date')).toBe(true)
      expect(closed).toBe(true)
    })

    // Switchyard closes after every HTTP/1.0 response; Node keeps the
    // connection when the app set the length.
    it('keeps the connection after a response the app sized only without Switchyard', async () => {
      const { text, closed } = await keepAliveRequest('/api/sized')
      expect(text.endsWith('sized')).toBe(true)
      if (process.env[SWITCHYARD_ENV] === '1') {
        expect(text).toMatch(/\r\nconnection: close\r\n/i)
        expect(closed).toBe(true)
      } else {
        expect(text).toMatch(/\r\nconnection: keep-alive\r\n/i)
        expect(closed).toBe(false)
      }
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

  // Some clients send their first message right behind the handshake,
  // without waiting for the 101.
  it('passes on a WebSocket message sent along with the handshake', async () => {
    const socket = net.connect(Number(next.appPort), '127.0.0.1')
    let received = ''
    socket.on('data', (chunk) => (received += chunk.toString('latin1')))
    const mask = randomBytes(4)
    const payload = Buffer.from('ping')
    const frame = Buffer.concat([
      // FIN and text frame, then a masked payload of payload.length bytes.
      Buffer.from([0x81, 0x80 | payload.length]),
      mask,
      Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4])),
    ])
    socket.write(
      Buffer.concat([
        Buffer.from(
          `GET /external/socket HTTP/1.1\r\nHost: localhost:${next.appPort}\r\n` +
            'Connection: Upgrade\r\nUpgrade: websocket\r\n' +
            `Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`
        ),
        frame,
      ])
    )
    try {
      await retry(() => {
        expect(received).toContain('101 Switching Protocols')
        expect(received).toContain('hello from /socket')
        expect(received).toContain('echo ping')
      })
    } finally {
      socket.destroy()
    }
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
