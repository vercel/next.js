import { nextTestSetup } from 'e2e-utils'

// Route group and dynamic param names are directory names, so they can hold
// characters outside Latin-1. They reach the segment cache key encoder, which
// used to hand them straight to `btoa` and throw `InvalidCharacterError`.
describe('non-latin1-segments', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('renders a page nested in a non-Latin-1 route group', async () => {
    const res = await next.fetch('/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from a route group')
  })

  it('renders a route whose dynamic param name is non-Latin-1', async () => {
    const res = await next.fetch('/docs/intro')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from a unicode param name')
  })

  // Navigating on the client builds the same segment keys through the segment
  // cache, so it covers the other half of the encoder's callers.
  it('navigates to both routes on the client', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#to-route-group').click()
    expect(await browser.waitForElementByCss('#hello').text()).toBe(
      'hello from a route group'
    )

    await browser.back()
    await browser.waitForElementByCss('#home')

    await browser.elementByCss('#to-unicode-param').click()
    expect(await browser.waitForElementByCss('#unicode-param').text()).toBe(
      'hello from a unicode param name'
    )
  })

  it('does not log an InvalidCharacterError', async () => {
    expect(next.cliOutput).not.toContain('InvalidCharacterError')
  })
})
