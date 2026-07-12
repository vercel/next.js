import { nextTestSetup } from 'e2e-utils'

describe('pages-404-with-empty-app-dir', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // Regression test for https://github.com/vercel/next.js/issues/58945
  // An `app` directory that exists but has no real app routes (e.g. only a
  // root layout, left over from an aborted App Router migration) must not
  // hijack 404 handling away from a custom `pages/404`.
  //
  // Known gap: `next build --turbopack` still registers an implicit
  // `_not-found` app route purely because the `app` directory exists,
  // regardless of whether it contains any real routes. That entrypoint
  // discovery happens on the Rust side (Turbopack's app-dir route
  // collection) and isn't fixed by this change, which only covers `next dev`
  // (both bundlers) and `next build` with webpack.
  const itFailsWithTurbopackProductionBuild =
    isNextStart && isTurbopack ? it.failing : it

  it('should render the pages router home page', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  /* eslint-disable jest/no-standalone-expect */
  itFailsWithTurbopackProductionBuild(
    'should use the custom pages/404 instead of the app router built-in not-found',
    async () => {
      const res = await next.fetch('/does-not-exist')
      expect(res.status).toBe(404)
      const html = await res.text()
      expect(html).toContain('PAGES ROUTER CUSTOM 404')
    }
  )

  itFailsWithTurbopackProductionBuild(
    'should use the custom pages/404 in the browser',
    async () => {
      const browser = await next.browser('/does-not-exist')
      expect(await browser.elementByCss('p').text()).toBe(
        'PAGES ROUTER CUSTOM 404'
      )
    }
  )
  /* eslint-enable jest/no-standalone-expect */
})
