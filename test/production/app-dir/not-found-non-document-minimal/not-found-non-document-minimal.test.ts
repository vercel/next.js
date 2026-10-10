import { nextTestSetup } from 'e2e-utils'

// This test synthesizes an adapter invocation using private runtime
// switches; it does not exercise the deployed platform proxy.
// @force-gate !deploy
describe('not-found-non-document-minimal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  it('returns a plain text 404 for subresource requests routed to the not-found page', async () => {
    const res = await next.fetch('/web-app-manifest-192x192.png', {
      headers: {
        'x-matched-path': '/_not-found',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-origin',
      },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/plain')
    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(await res.text()).toBe('Not Found')
  })

  it('renders the not-found page for document requests', async () => {
    const res = await next.fetch('/does-not-exist', {
      headers: {
        'x-matched-path': '/_not-found',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
      },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('custom not found page')
  })

  it('serves the not-found RSC payload for router requests', async () => {
    const res = await next.fetch('/does-not-exist', {
      headers: {
        'x-matched-path': '/_not-found',
        rsc: '1',
      },
    })
    expect(res.headers.get('content-type')).toContain('text/x-component')
    expect(await res.text()).not.toBe('Not Found')
  })

  it('renders the not-found page for requests without sec-fetch-dest', async () => {
    const res = await next.fetch('/whatever.bin', {
      headers: {
        'x-matched-path': '/_not-found',
      },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('custom not found page')
  })
})
