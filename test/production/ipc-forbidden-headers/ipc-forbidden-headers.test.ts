import { nextTestSetup } from 'e2e-utils'
import { fetchViaRawHttp } from 'next-test-utils'

describe('ipc-forbidden-headers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not error if expect header is included', async () => {
    // Global fetch refuses to send an `Expect: 100-continue` request, so
    // these use a raw HTTP request.
    let res = await fetchViaRawHttp(next.appPort, '/api/pages-api', {
      method: 'POST',
      headers: { expect: '100-continue' },
    })
    let text = await res.text()

    expect(text).toEqual('Hello, Next.js!')

    res = await fetchViaRawHttp(next.appPort, '/api/app-api', {
      method: 'POST',
      headers: {
        expect: '100-continue',
      },
    })
    text = await res.text()

    expect(text).toEqual('Hello, Next.js!')
    expect(next.cliOutput).not.toContain('UND_ERR_NOT_SUPPORTED')
  })

  it("should not error on content-length: 0 if request shouldn't contain a payload", async () => {
    // Global fetch rejects Content-Length on a bodyless request
    // (UND_ERR_REQ_CONTENT_LENGTH_MISMATCH), so these use a raw HTTP request.
    let res = await fetchViaRawHttp(next.appPort, '/api/pages-api', {
      method: 'DELETE',
      headers: { 'content-length': '0' },
    })

    expect(res.status).toBe(200)

    res = await fetchViaRawHttp(next.appPort, '/api/app-api', {
      method: 'DELETE',
      headers: { 'content-length': '0' },
    })

    expect(res.status).toBe(200)
    expect(next.cliOutput).not.toContain('UND_ERR_REQ_CONTENT_LENGTH_MISMATCH')
  })
})
