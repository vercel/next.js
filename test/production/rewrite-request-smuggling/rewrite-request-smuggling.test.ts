import net from 'net'
import http from 'http'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('rewrite-request-smuggling', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const ssrfProbePath = '/secret-upgrade'
  const ssrfProbeBody =
    'SSRF_CONFIRMED: You reached the internal service at 127.0.0.1'
  let backend: http.Server
  let backendPort: number
  let intermediary: http.Server
  let intermediaryPort: number
  const backendRequests: string[] = []

  async function sendSmugglingPayload({
    nextPort,
    connectionHeader,
    method = 'DELETE',
    rewritePath = '/rewrites/poc',
  }: {
    nextPort: number
    connectionHeader: string
    method?: 'DELETE' | 'OPTIONS'
    rewritePath?: string
  }) {
    const smuggledRequest = Buffer.from(
      `GET /secret HTTP/1.1\r\nHost: 127.0.0.1:${nextPort}\r\n\r\n`,
      'latin1'
    )
    const chunkSize = Buffer.from(
      `${smuggledRequest.length.toString(16).toUpperCase()}\r\n`,
      'latin1'
    )

    const payload = Buffer.concat([
      Buffer.from(
        `${method} ${rewritePath} HTTP/1.1\r\nHost: 127.0.0.1:${nextPort}\r\nTransfer-Encoding: chunked\r\nConnection: ${connectionHeader}\r\n\r\n`,
        'latin1'
      ),
      chunkSize,
      smuggledRequest,
      Buffer.from('\r\n0\r\n\r\n', 'latin1'),
    ])

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({
        host: '127.0.0.1',
        port: nextPort,
      })

      socket.once('connect', () => {
        socket.write(payload)
      })
      socket.once('error', reject)
      socket.setTimeout(5000, () => socket.destroy())
      socket.once('close', () => resolve())
    })
  }

  async function sendAbsoluteUrlUpgradePayload({
    nextPort,
    targetPort,
  }: {
    nextPort: number
    targetPort: number
  }) {
    const payload = Buffer.from(
      `GET http://127.0.0.1:${targetPort}${ssrfProbePath} HTTP/1.1\r\nHost: 127.0.0.1:${nextPort}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
      'latin1'
    )

    return await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection({
        host: '127.0.0.1',
        port: nextPort,
      })
      const chunks: Buffer[] = []
      let settled = false

      const finish = () => {
        if (settled) return
        settled = true
        resolve(Buffer.concat(chunks).toString('latin1'))
      }

      socket.once('connect', () => {
        socket.write(payload)
      })
      socket.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      socket.once('error', (err) => {
        if (settled) return
        settled = true
        reject(err)
      })
      socket.setTimeout(1000, () => socket.destroy())
      socket.once('close', finish)
    })
  }

  beforeAll(async () => {
    backendPort = await findPort()
    intermediaryPort = await findPort()

    backend = http.createServer((req, res) => {
      backendRequests.push(`${req.method} ${req.url}`)

      if (req.url?.startsWith('/rewrites/')) {
        res.statusCode = 200
        res.end('rewrite-ok')
        return
      }

      if (req.url === '/secret') {
        res.statusCode = 200
        res.end('secret')
        return
      }

      res.statusCode = 404
      res.end('not-found')
    })

    backend.on('upgrade', (req, socket) => {
      backendRequests.push(`${req.method} ${req.url}`)
      socket.write(
        `HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(ssrfProbeBody)}\r\n\r\n${ssrfProbeBody}`
      )
      socket.end()
    })

    intermediary = http.createServer((req, res) => {
      const connectionHeader = Array.isArray(req.headers['connection'])
        ? req.headers['connection'].join(',')
        : req.headers['connection'] || ''
      const hopByHopHeaders = connectionHeader
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean)
      const stripTransferEncodingUnconditionally =
        req.url?.startsWith('/rewrites/non-rfc-strip') || false

      const forwardHeaders: Record<string, string | string[]> = {}
      for (const [key, value] of Object.entries(req.headers)) {
        if (key === 'connection') continue
        if (stripTransferEncodingUnconditionally && key === 'transfer-encoding')
          continue
        if (hopByHopHeaders.includes(key)) continue
        if (value !== undefined) {
          forwardHeaders[key] = value
        }
      }
      forwardHeaders.connection = stripTransferEncodingUnconditionally
        ? connectionHeader.toLowerCase().includes('close')
          ? 'close'
          : 'keep-alive'
        : 'keep-alive'

      const proxyReq = http.request(
        {
          hostname: '127.0.0.1',
          port: backendPort,
          method: req.method,
          path: req.url,
          headers: forwardHeaders,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers)
          proxyRes.pipe(res)
        }
      )

      proxyReq.on('error', () => {
        res.statusCode = 502
        res.end('Bad Gateway')
      })

      req.pipe(proxyReq)
    })

    await new Promise<void>((resolve, reject) => {
      backend.listen(backendPort, '127.0.0.1', resolve)
      backend.once('error', reject)
    })

    await new Promise<void>((resolve, reject) => {
      intermediary.listen(intermediaryPort, '127.0.0.1', resolve)
      intermediary.once('error', reject)
    })

    await next.start({
      env: { TEST_INTERMEDIARY_PORT: String(intermediaryPort) },
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => intermediary.close(() => resolve()))
    await new Promise<void>((resolve) => backend.close(() => resolve()))
  })

  it('does not smuggle a second request when using keep-alive only', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload({ nextPort, connectionHeader: 'keep-alive' })

    await retry(async () => {
      expect(backendRequests).toContain('DELETE /rewrites/poc')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })

  it('does not smuggle a second request with keep-alive, upgrade', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload({
      nextPort,
      connectionHeader: 'keep-alive, upgrade',
    })

    await retry(async () => {
      expect(backendRequests).toContain('DELETE /rewrites/poc')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })

  it('does not smuggle a second request with Transfer-Encoding, upgrade', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload({
      nextPort,
      connectionHeader: 'Transfer-Encoding, upgrade',
    })

    await retry(async () => {
      expect(backendRequests).toContain('DELETE /rewrites/poc')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })

  it('does not smuggle a second request for OPTIONS with Transfer-Encoding, upgrade', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload({
      nextPort,
      method: 'OPTIONS',
      connectionHeader: 'Transfer-Encoding, upgrade',
    })

    await retry(async () => {
      expect(backendRequests).toContain('OPTIONS /rewrites/poc')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })

  it('does not smuggle a second request when an intermediary strips transfer-encoding unconditionally', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload({
      nextPort,
      method: 'OPTIONS',
      rewritePath: '/rewrites/non-rfc-strip',
      connectionHeader: 'keep-alive, upgrade',
    })

    await retry(async () => {
      expect(backendRequests).toContain('OPTIONS /rewrites/non-rfc-strip')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })

  it('does not proxy upgrade requests with absolute URLs without an external rewrite', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    const response = await sendAbsoluteUrlUpgradePayload({
      nextPort,
      targetPort: backendPort,
    })

    expect(response).not.toContain(ssrfProbeBody)
    expect(
      backendRequests.some((request) => request.includes(ssrfProbePath))
    ).toBe(false)
  })
})
