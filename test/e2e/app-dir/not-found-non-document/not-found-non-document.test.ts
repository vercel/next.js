import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('not-found-non-document', () => {
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
    if (isNextDeploy) {
      // When deployed, unmatched paths are served the prerendered 404 page
      // without invoking Next.js.
      expect(res.headers.get('content-type')).toContain('text/html')
    } else {
      expect(res.headers.get('content-type')).toContain('text/plain')
      expect(await res.text()).toBe('Not Found')
      expect(next.cliOutput.slice(outputIndex)).not.toContain(
        '__not-found-component-rendered__'
      )
    }
  })

  it('returns a plain text 404 for font and manifest requests to unknown paths', async () => {
    for (const dest of ['font', 'manifest']) {
      const res = await next.fetch(`/missing-${dest}`, {
        headers: {
          'sec-fetch-dest': dest,
          'sec-fetch-mode': 'no-cors',
          'sec-fetch-site': 'same-origin',
        },
      })
      expect(res.status).toBe(404)
      if (isNextDeploy) {
        expect(res.headers.get('content-type')).toContain('text/html')
      } else {
        expect(res.headers.get('content-type')).toContain('text/plain')
        expect(await res.text()).toBe('Not Found')
      }
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

  it('renders the not-found page for requests without sec-fetch-dest', async () => {
    const res = await next.fetch('/does-not-exist')
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

  it('renders the not-found page on client navigation to unknown paths', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#link-to-missing').click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe(
        'custom not found page'
      )
    })
  })
})
