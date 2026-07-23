import { isNextDeploy, nextTestSetup } from 'e2e-utils'

describe('not-found-non-document-dynamic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('returns a plain text 404 for subresource requests to unknown paths', async () => {
    const outputIndex = next.cliOutput.length
    const res = await next.fetch('/web-app-manifest-192x192.png', {
      headers: {
        accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-origin',
      },
    })
    expect(res.status).toBe(404)
    if (isNextDeploy && process.env.__NEXT_CACHE_COMPONENTS) {
      // With cache components the not-found route is prerendered, and the
      // deployed routing layer serves prerenders without invoking Next.js.
      // TODO: It might be good to align the CDN behavior so subresource
      // requests to unknown paths get the plain text 404 when deployed too.
      expect(res.headers.get('content-type')).toContain('text/html')
    } else {
      expect(res.headers.get('content-type')).toContain('text/plain')
      expect(res.headers.get('cache-control')).toBe(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
      expect(await res.text()).toBe('Not Found')
    }
    if (!isNextDeploy) {
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        '__not-found-component-rendered__'
      )
    }
  })

  it('renders the not-found page for document requests to unknown paths', async () => {
    const res = await next.fetch('/does-not-exist', {
      headers: {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
      },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('custom not found page')
  })

  it('renders the not-found page for fetch requests to unknown paths', async () => {
    const res = await next.fetch('/does-not-exist', {
      headers: {
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
    })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('custom not found page')
  })
})
