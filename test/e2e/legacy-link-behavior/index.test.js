import { nextTestSetup } from 'e2e-utils'

describe('Link with legacyBehavior', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  let previousOutputIndex
  beforeEach(() => {
    previousOutputIndex = next.cliOutput.length
  })

  function newConsoleOutput() {
    return next.cliOutput.slice(previousOutputIndex)
  }

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
      expect(newConsoleOutput()).toBe('')
    })
  })

  it('works if the child is a number', async () => {
    const browser = await next.browser('/child-is-a-number')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
    expect(newConsoleOutput()).toBe('')
  })

  it('works if the child is a string', async () => {
    const browser = await next.browser('/child-is-a-string')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
    expect(newConsoleOutput()).toBe('')
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
      expect(newConsoleOutput()).toBe('')
    })
  })
})
