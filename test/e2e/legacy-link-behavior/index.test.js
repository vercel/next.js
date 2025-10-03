import { nextTestSetup } from 'e2e-utils'

describe('legacyBehavior', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('with a child <a> element', () => {
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

  describe('React.Lazy as children', () => {
    // Validation 1. RSC only. Verify it's a client reference. If it's a string it's fine. If it's not a string, verify client reference. That's fine. Otherwise, error (don't throw) but show error that its incompatible to use legacyBeahvior when rendering server component children into next/link.
    /*
     */

    // Validation 2. (second line of defense)
    // if the children of the link is lazy in the client link, then warn about
    /*
      You've passed a lazy element to the link. In a next.js app this is often because you are passing a Server Component as a direct child of Link. This is not supported if you're using legacyMode. Remove legacyMode, or make the direct child of Link a client component.
    */

    it.todo('warns if children is a single lazy component')
    it.todo('warns if children is multiple lazy compnenet')

    it.todo('warns if children is a single lazy element')
    it.todo('warns if children is a multiple lazy elements')
  })

  describe('RSC as child', () => {
    it.todo('warns if the child is an RSC', () => {
      // how to tell? lazy, but could be React.lazy
      // could also be an RSC thats not lazy
    })
    it.todo('warns if the child is lazy')
    //
  })
})
