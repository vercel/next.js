import http from 'http'
import zlib from 'zlib'
import { findPort } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

const DECODED = 'A'.repeat(1000)

// @force-gate !deploy
describe('stale-compressed-framing-cache-components', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  const compressed = zlib.gzipSync(DECODED)
  let upstream: http.Server

  beforeAll(async () => {
    const upstreamPort = await findPort()
    upstream = http.createServer((req, res) => {
      res.setHeader('content-encoding', 'gzip')
      res.setHeader('content-length', compressed.length)
      res.end(compressed)
    })
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject)
      upstream.listen(upstreamPort, () => resolve())
    })
    await next.start({ env: { TEST_UPSTREAM_PORT: String(upstreamPort) } })
  })

  afterAll(() => upstream.close())

  it('strips stale compressed framing on a prerendered response', async () => {
    const res = await next.fetch('/proxy')
    expect(res.headers.get('content-encoding')).toBeNull()
    expect(res.headers.get('content-length')).not.toBe(
      String(compressed.length)
    )
    expect(await res.text()).toBe(DECODED)
  })
})
