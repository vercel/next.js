import { nextTestSetup } from 'e2e-utils'

describe('use-router-with-rewrites', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should preserve current pathname when using useRouter.push with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementById('router-push').click()

    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/?param=1`
    )
  })

  it('should preserve current pathname when using useRouter.replace with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementById('router-replace').click()

    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/?param=1`
    )
  })

  it('should preserve current pathname when using Link with rewrites', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('a').click()
    expect(await browser.url()).toBe(
      `http://localhost:${next.appPort}/?param=1`
    )
  })

  describe('rewrite to another segment', () => {
    it('should preserve current pathname when using useRouter.push with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-another-segment/0')
      await browser.elementById('router-push').click()

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/rewrite-to-another-segment/1`
      )
    })

    it('should preserve current pathname when using useRouter.replace with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-another-segment/0')
      await browser.elementById('router-replace').click()

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/rewrite-to-another-segment/2`
      )
    })

    it('should preserve current pathname when using Link with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-another-segment/0')
      await browser.elementByCss('a').click()

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/rewrite-to-another-segment/3`
      )
    })
  })

  describe('rewrite to same segment', () => {
    it('should preserve current pathname when using useRouter.push with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-same-segment/0')
      await browser.elementById('router-push').click()

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/rewrite-to-same-segment/1`
      )

      expect(await browser.elementByCss('p').text()).toBe('001')
    })

    it('should preserve current pathname when using useRouter.replace with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-same-segment/0')
      await browser.elementById('router-replace').click()

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/rewrite-to-same-segment/2`
      )

      expect(await browser.elementByCss('p').text()).toBe('002')
    })

    it('should preserve current pathname when using Link with rewrites on dynamic route', async () => {
      const browser = await next.browser('/rewrite-to-same-segment/0')
      await browser.elementByCss('a').click()

      expect(await browser.url()).toBe(
        `http://localhost:${next.appPort}/rewrite-to-same-segment/3`
      )

      expect(await browser.elementByCss('p').text()).toBe('003')
    })
  })
})
