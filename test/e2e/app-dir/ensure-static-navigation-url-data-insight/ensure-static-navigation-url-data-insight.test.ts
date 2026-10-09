import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'

// Regression coverage for a reported dev-overlay false positive. The catch-all
// route below is fully prerendered: `generateStaticParams` enumerates every
// URL and the locale layout opts into `ensureStatic = 'navigation'`. The
// "URL data during prerendering or a navigation" instant insight still fires
// on every page of the route, and its suggested fixes never mention that
// moving the `params` read into `<Suspense>` makes `notFound()` flush a 200
// shell instead of a 404.
//
// These assertions capture today's (incorrect) behavior. A fix that stops the
// insight from firing here, or that explains the `notFound()` trade-off, will
// fail them and must update the expectations.
// @force-gate dev
describe('ensure-static navigation URL data insight', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TEST_LOG_VALIDATION: '1' },
  })
  if (skipped) return

  let cliOutputIndex = 0
  beforeEach(() => {
    cliOutputIndex = next.cliOutput.length
  })
  const getCliOutputSinceMark = () => next.cliOutput.slice(cliOutputIndex)

  it.each(['/en', '/en/about'])(
    'still reports URL data outside of Suspense on prerendered %s',
    async (pathname) => {
      const browser = await next.browser(pathname)
      const output = await getDevCliValidationOutput(
        await browser.url(),
        getCliOutputSinceMark
      )

      expect(output).toContain(
        'Route "/[locale]/[[...slug]]": Next.js encountered URL data during prerendering or a navigation.'
      )
    }
  )

  it('suggests Suspense or instant = false without mentioning the notFound() trade-off', async () => {
    // `notFound()` runs after the `params` read, so wrapping that read in
    // `<Suspense>` (the first suggested fix) flushes the shell and turns this
    // 404 into a 200. The insight never says so.
    expect((await next.fetch('/en/unknown')).status).toBe(404)

    const browser = await next.browser('/en')
    const output = await getDevCliValidationOutput(
      await browser.url(),
      getCliOutputSinceMark
    )

    expect(output).toContain(
      'Ways to fix this:\n' +
        '  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access\n' +
        '  - [block] Set `export const instant = false` to allow a blocking route'
    )
    expect(output).not.toContain('notFound')
  })
})
