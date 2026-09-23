import { nextTestSetup } from 'e2e-utils'

describe('isr-app-getinitialprops-cache-control', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // https://github.com/vercel/next.js/issues/14244
  // ISR cache-control should take precedence over headers set in _app.getInitialProps
  it('should use ISR cache-control instead of _app header for pre-rendered pages', async () => {
    const res = await next.fetch('/')
    const cacheControl = res.headers.get('cache-control')

    // ISR page with revalidate: 10 should have s-maxage=10
    // _app sets 'max-age=0, must-revalidate' which should NOT override this
    expect(cacheControl).toMatch(/s-maxage=10/)
  })

  // Test with dynamic route that requires server-side rendering (fallback: blocking)
  // This is the key test case - when _app.getInitialProps runs during SSR,
  // the ISR cache-control should still take precedence
  it('should use ISR cache-control on dynamic routes with fallback blocking', async () => {
    const res = await next.fetch('/test-slug')
    const cacheControl = res.headers.get('cache-control')

    // Even on first render (fallback blocking), ISR cache-control should win
    expect(cacheControl).toMatch(/s-maxage=10/)
  })

  it('should render pages correctly', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')

    const $dynamic = await next.render$('/test-slug')
    expect($dynamic('p').text()).toBe('slug: test-slug')
  })
})
