import { nextTestSetup } from 'e2e-utils'

// Pages Router API routes read the request body with a module that bundles
// every character encoding it can decode. It is by far the largest module such
// a route loads, so a request without a body must not load it.
describe('api-lazy-body-parser', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not load the body reader until a request has a body', async () => {
    let res = await next.fetch('/api/body')
    expect(await res.json()).toEqual({
      body: '',
      contentLength: null,
      bodyReaderLoaded: false,
    })

    res = await next.fetch('/api/body', {
      headers: { 'content-type': 'application/json' },
    })
    expect(await res.json()).toEqual({
      body: {},
      contentLength: null,
      bodyReaderLoaded: false,
    })

    const body = JSON.stringify({ hello: 'world' })
    res = await next.fetch('/api/body', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    expect(await res.json()).toEqual({
      body: { hello: 'world' },
      contentLength: String(body.length),
      bodyReaderLoaded: true,
    })
  })

  it('should parse a body that is sent without a content-length', async () => {
    const res = await next.fetch('/api/body', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new Blob([JSON.stringify({ hello: 'stream' })]).stream(),
      duplex: 'half',
    } as RequestInit)
    expect(await res.json()).toEqual({
      body: { hello: 'stream' },
      contentLength: null,
      bodyReaderLoaded: true,
    })
  })

  it('should parse a body when the proxy replaced the request headers', async () => {
    const res = await next.fetch('/api/behind-proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'proxy' }),
    })
    // The route does not see a `content-length` header, but the body is there.
    expect(await res.json()).toEqual({
      body: { hello: 'proxy' },
      contentLength: null,
      bodyReaderLoaded: true,
    })
  })
})
