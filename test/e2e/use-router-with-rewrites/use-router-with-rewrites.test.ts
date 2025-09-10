import { nextTestSetup } from 'e2e-utils'

describe('use-router-with-rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve current pathname when using useRouter.push with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementById('router-push').click()

    const url = new URL(await browser.url())
    expect(url.pathname + url.search).toBe('/?param=1')
  })

  it('should preserve current pathname when using useRouter.replace with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementById('router-replace').click()

    const url = new URL(await browser.url())
    expect(url.pathname + url.search).toBe('/?param=1')
  })

  it('should preserve current pathname when using Link with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a').click()

    const url = new URL(await browser.url())
    expect(url.pathname + url.search).toBe('/?param=1')
  })

  describe('rewrite to another segment', () => {
    it('should preserve current pathname when using useRouter.push with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-another-segment/0')
      await browser.elementById('router-push').click()

      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe(
        '/rewrite-to-another-segment/0?id=1'
      )
    })

    it('should preserve current pathname when using useRouter.replace with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-another-segment/0')
      await browser.elementById('router-replace').click()

      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe(
        '/rewrite-to-another-segment/0?id=2'
      )
    })

    it('should preserve current pathname when using Link with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-another-segment/0')
      await browser.elementByCss('a').click()

      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe(
        '/rewrite-to-another-segment/0?id=3'
      )
    })
  })

  // This is an edge case where rewrite won't work as expected due to trade-off,
  // but interpolates the query instead.
  describe('rewrite to same segment', () => {
    it('should preserve current pathname when using useRouter.push with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-same-segment/0')
      await browser.elementById('router-push').click()

      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe('/rewrite-to-same-segment/1')

      expect(await browser.elementByCss('p').text()).toBe('1')
    })

    it('should preserve current pathname when using useRouter.replace with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-same-segment/0')
      await browser.elementById('router-replace').click()

      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe('/rewrite-to-same-segment/2')

      expect(await browser.elementByCss('p').text()).toBe('2')
    })

    it('should preserve current pathname when using Link with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-same-segment/0')
      await browser.elementByCss('a').click()

      const url = new URL(await browser.url())
      expect(url.pathname + url.search).toBe('/rewrite-to-same-segment/3')

      expect(await browser.elementByCss('p').text()).toBe('3')
    })
  })
})
