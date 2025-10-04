import { nextTestSetup, isNextDev } from 'e2e-utils'

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

  describe('validations from server components', () => {
    // rendering <Link> in RSC
    it.only('warns if the child is synchronous server component', async () => {
      const browser = await next.browser('/rsc/synchronous')
      const logs = await browser.log()

      const errors = logs.filter(
        (log) =>
          log.source === 'error' &&
          log.message.includes(
            `You're passing either a Server Component or a Lazy Component into a <Link> that has legacyBehavior enabled`
          )
      )

      expect(errors.length).toBe(isNextDev ? 1 : 0)
    })
    it.todo(
      'warns and throws an error if the child is asynchronous server component'
    )
    it.todo('does not warn or throw if you pass a client component')
    it.todo(
      'does not warn or throw if you pass a server component into a client component into Link'
    )

    // rendering a <ClientComponent> that renders <Link>
    it.todo('doesnt warn if the child is synchronous server component')
    it.todo('throws an error if the child is asynchronous server component')
    it.todo('does not warn or throw if you pass a client component 2')
    it.todo(
      'does not warn or throw if you pass a server component into a client component into Link 2'
    )
  })

  // For prod tests:
  // https://github.com/vercel/next.js/blob/canary/test/e2e/app-dir/cache-components/cache-components.console.test.ts
  // add -u to update snapshots

  describe('validations from client components', () => {
    it.todo('does not warn or throw if you pass a child component')
    it.todo('warns and throws an error if the child is lazy JSX')
  })
})
