import { nextTestSetup } from 'e2e-utils'

describe('turbo-resolve-extensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should SSR', async () => {
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello world')
    expect(html).toContain('hello server')
    expect(html).toContain('hello image 1')
    expect(html).toContain('hello image 2')
  })

  it('should work using browser', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('body').text()
    expect(text).toContain('hello world')
    expect(text).toContain('hello client')
  })

  it('should respect resolveExtensions priority (.web.tsx before .tsx)', async () => {
    // When both PlatformComponent.web.tsx and PlatformComponent.tsx exist,
    // the .web.tsx variant must win because it appears first in resolveExtensions.
    // This guards against a Turbopack bug where the alternative index was
    // hardcoded to 0 in the fast path, collapsing all alternatives to the same
    // priority and making the winner non-deterministic (usually wrong).
    const res = await next.fetch('/')
    const html = await res.text()
    expect(html).toContain('hello web platform')
    expect(html).not.toContain('hello default platform')
  })
})
