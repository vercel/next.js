import { nextTestSetup } from 'e2e-utils'

describe('cache regeneration global error', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('renders the global error boundary when regeneration fails', async () => {
    if (isNextDev) {
      return
    }

    const initialResponse = await next.fetch('/cached')
    expect(initialResponse.status).toBe(200)
    expect(await initialResponse.text()).toContain('generated during build')

    const invalidationResponse = await next.fetch('/api/invalidate', {
      method: 'POST',
    })
    expect(invalidationResponse.status).toBe(204)

    const errorResponse = await next.fetch('/cached')
    expect(errorResponse.status).toBe(500)
    expect(errorResponse.headers.get('content-type')).toContain('text/html')
    expect(errorResponse.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(errorResponse.headers.get('x-nextjs-cache')).toBe('MISS')

    const browser = await next.browser('/cached')
    expect(await browser.elementByCss('#global-error').text()).toBe(
      'global error'
    )
  })
})
