import { nextTestSetup } from 'e2e-utils'

describe('Link with legacyBehavior', () => {
  const { next } = nextTestSetup({
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
      const title = await browser.elementByCss('h1').text()

      expect(title).toBe('About Page')
    })
  })

  it('works if the child is a number', async () => {
    const browser = await next.browser('/child-is-a-number')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  describe('passHref', () => {
    it.todo('should error if legacyBehavior is not enabled')
    it.todo('errors if onClick is called without the event')

    describe('if the child is a custom component that wraps an <a> tag', () => {
      it.todo('should pass the href to the <a> tag if enabled')
      it.todo('should not pass the href to the <a> tag if disabled')
    })
  })
})
