import { nextTestSetup } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import http from 'http'

describe('patch-fetch-request-body', () => {
  let externalServerPort: number
  let externalServer: http.Server

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  beforeAll(async () => {
    externalServerPort = await findPort()

    externalServer = http.createServer((req, res) => {
      req.resume()
      req.on('end', () => {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 401 }))
      })
    })

    await new Promise<void>((resolve, reject) => {
      externalServer.listen(externalServerPort, () => resolve())
      externalServer.once('error', reject)
    })

    next.env.EXTERNAL_SERVER_PORT = String(externalServerPort)
    await next.start()
  })

  afterAll(() => {
    externalServer?.close()
  })

  // On Node 24.14+, patch-fetch previously reconstructed the Request using
  // reqInput.url which lost the internal body source. undici then threw
  // "TypeError: expected non-null body source" when sending the request.
  it('should preserve Request body source for uncached POST requests', async () => {
    const res = await next.fetch('/api/test-post', { method: 'POST' })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe(401)
  })
})
