import { nextTestSetup } from 'e2e-utils'

describe('variants', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // The proxy rewrites to an internal `/__variants/<packed>` path, which the
    // Next.js router strips before it matches a route. Deployments route at the
    // CDN instead, and the build output declares nothing for that prefix, so
    // the rewritten request resolves to the 404 route. Enable once the build
    // output carries the prefix.
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should resolve a variant to its default value', async () => {
    const $ = await next.render$('/')

    expect($('#theme').text()).toBe('light')
  })

  it('should resolve a variant from the request', async () => {
    const $ = await next.render$('/', undefined, {
      headers: { cookie: 'theme=dark' },
    })

    expect($('#theme').text()).toBe('dark')
  })

  it('should not expose the internal variants prefix to the client', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#theme').text()).toBe('light')
    expect(await browser.eval('location.pathname')).toBe('/')
  })
})
