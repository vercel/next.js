import net from 'net'
import http from 'http'
import { createNext, NextInstance } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'

describe('rewrite-request-smuggling', () => {
  if ((global as any).isNextDeploy) {
    it('should skip deploy', () => {})
    return
  }

  let backend: http.Server
  let backendPort: number
  let next: NextInstance
  const backendRequests: string[] = []

  async function sendSmugglingPayload(
    nextPort: number,
    connectionHeader: string
  ) {
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
        `DELETE /rewrites/poc HTTP/1.1\r\nHost: 127.0.0.1:${nextPort}\r\nTransfer-Encoding: chunked\r\nConnection: ${connectionHeader}\r\n\r\n`,
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
      socket.setTimeout(1000, () => socket.destroy())
      socket.once('close', () => resolve())
    })
  }

  beforeAll(async () => {
    backendPort = await findPort()

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

    await new Promise<void>((resolve, reject) => {
      backend.listen(backendPort, '127.0.0.1', resolve)
      backend.once('error', reject)
    })

    next = await createNext({
      files: __dirname,
      env: {
        TEST_BACKEND_PORT: String(backendPort),
      },
    })
  })

  afterAll(async () => {
    await next?.destroy()
    await new Promise<void>((resolve) => backend.close(() => resolve()))
  })

  it('does not smuggle a second request when using keep-alive only', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload(nextPort, 'keep-alive')

    await retry(async () => {
      expect(backendRequests).toContain('DELETE /rewrites/poc')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })

  it('does not smuggle a second request with keep-alive, upgrade', async () => {
    backendRequests.length = 0

    const nextPort = Number(new URL(next.url).port)
    await sendSmugglingPayload(nextPort, 'keep-alive, upgrade')

    await retry(async () => {
      expect(backendRequests).toContain('DELETE /rewrites/poc')
    })
    expect(backendRequests).not.toContain('GET /secret')
  })
})
