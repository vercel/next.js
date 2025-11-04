import { nextTestSetup } from 'e2e-utils'

describe('Link with legacyBehavior', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  describe('if the child is an <a> tag', () => {
    it('forwards the href attribute', async () => {
      const $ = await next.render$('/')
      const $a = $('a')

      expect($a.text()).toBe('About')
      expect($a.attr('href')).toBe('/about')
    })

    it('navigates correctly', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('a').click()
      const title = await browser.elementByCss('#about-page').text()

      expect(title).toBe('About Page')
    })
  })

  it('works if the child is a number', async () => {
    const browser = await next.browser('/child-is-a-number')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  it('works if the child is a string', async () => {
    const browser = await next.browser('/child-is-a-string')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  it('errors when calling onClick without the event', async () => {
    const browser = await next.browser('/invalid-onclick')
    expect(await browser.elementByCss('#errors').text()).toBe('0')
    await browser.elementByCss('#custom-button').click()
    expect(await browser.elementByCss('#errors').text()).toBe('1')
  })

  it('should show a deprecation warning', async () => {
    const browser = await next.browser('/')
    const logs = await browser.log()

    const errors = logs.filter(
      (log) =>
        log.source === 'error' &&
        log.message.includes(
          '`legacyBehavior` is deprecated and will be removed in a future release.'
        )
    )

    console.log(errors)

    expect(errors.length).toBe(isNextDev ? 1 : 0)
  })

  describe('passHref', () => {
    it('forwards the href attribute', async () => {
      const $ = await next.render$('/passHref')
      const $a = $('a')

      expect($a.text()).toBe('About')
      expect($a.attr('href')).toBe('/about')
    })

    it('navigates correctly', async () => {
      const browser = await next.browser('/passHref')
      await browser.elementByCss('a').click()
      const title = await browser.elementByCss('h1').text()

      expect(title).toBe('About Page')
    })
  })
})
