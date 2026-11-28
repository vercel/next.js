import { nextTestSetup } from 'e2e-utils'
import { fetchViaRawHttp } from 'next-test-utils'

describe('Compression disabled (compress: false)', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('serves identity to any Accept-Encoding, even the best one', async () => {
    for (const acceptEncoding of ['zstd, br, gzip', 'br', 'gzip', '*']) {
      const response = await fetchViaRawHttp(next.url, '/', {
        headers: { 'accept-encoding': acceptEncoding },
      })
      const body = Buffer.from(await response.arrayBuffer())
      expect(response.headers.get('content-encoding')).toBeNull()
      expect(body.toString()).toContain('hello')
    }
  })
})
