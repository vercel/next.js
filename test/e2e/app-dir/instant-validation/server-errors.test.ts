import { nextTestSetup, type Playwright } from 'e2e-utils'
import {
  extractBuildValidationError,
  getDevCliValidationOutput,
  waitForValidation,
} from 'e2e-utils/instant-validation'
import { retry, waitForRedbox } from '../../../lib/next-test-utils'
import { createRedboxSnapshot } from '../../../lib/add-redbox-matchers'

describe('instant validation - server errors', () => {
  const { next, skipped, isNextDev, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
    env: {
      NEXT_TEST_LOG_VALIDATION: '1',
    },
  })
  if (skipped) return

  if (isNextStart && !isTurbopack) {
    it.skip('TODO: snapshot tests for webpack', () => {})
    return
  }

  if (isNextStart) {
    beforeAll(async () => {
      await next.build({ args: ['--experimental-build-mode', 'compile'] })
    })
    afterEach(async () => {
      await next.stop()
    })
  } else {
    beforeAll(async () => {
      await next.start()
    })
  }

  let currentCliOutputIndex = 0
  beforeEach(() => {
    currentCliOutputIndex = next.cliOutput.length
  })

  function getCliOutputSinceMark(): string {
    if (next.cliOutput.length < currentCliOutputIndex) {
      currentCliOutputIndex = 0
    }
    return next.cliOutput.slice(currentCliOutputIndex)
  }

  const prerender = async (pathname: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      `app${pathname}/page.tsx`,
    ]
    return await next.build({ args })
  }

  const cases = isNextDev
    ? [
        { isClientNav: false, description: 'dev - initial load' },
        { isClientNav: true, description: 'dev - client navigation' },
      ]
    : [{ isClientNav: false, description: 'build' }]

  describe.each(cases)('$description', ({ isClientNav }) => {
    it('server error blocks children - validation suppressed', async () => {
      if (isNextDev) {
        const browser = isClientNav
          ? await navigateViaClientNav(
              '/suspense-in-root/static/server-error-blocks-children'
            )
          : await next.browser(
              '/suspense-in-root/static/server-error-blocks-children'
            )
        await waitForRedbox(browser)
        await waitForValidation(await browser.url(), getCliOutputSinceMark)
        const errors = await createRedboxSnapshot(browser, next)
        expect(errors).toMatchInlineSnapshot(`
         {
           "description": "Server component error",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/suspense-in-root/static/server-error-blocks-children/layout.tsx (7:9) @ ServerError
         >  7 |   throw new Error('Server component error')
              |         ^",
           "stack": [
             "ServerError app/suspense-in-root/static/server-error-blocks-children/layout.tsx (7:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/server-error-blocks-children'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/server-error-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.
             at ignore-listed frames
         Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
             at a (<anonymous>)
             at body (<anonymous>)
             at html (<anonymous>)
             at b (<anonymous>) {
           [cause]: Error: Server component error
               at c (app/suspense-in-root/static/server-error-blocks-children/layout.tsx:7:9)
              5 |
              6 | function ServerError() {
           >  7 |   throw new Error('Server component error')
                |         ^
              8 | }
              9 |
             10 | export default async function Layout({ children }: { children: ReactNode }) { {
             digest: '<error-digest>'
           }
         }
         Build-time instant validation failed for route "/suspense-in-root/static/server-error-blocks-children".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/server-error-blocks-children" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('server error inside boundary - validation suppressed', async () => {
      if (isNextDev) {
        const browser = isClientNav
          ? await navigateViaClientNav(
              '/suspense-in-root/static/server-error-inside-boundary'
            )
          : await next.browser(
              '/suspense-in-root/static/server-error-inside-boundary'
            )
        await waitForRedbox(browser)
        await waitForValidation(await browser.url(), getCliOutputSinceMark)
        const errors = await createRedboxSnapshot(browser, next)
        expect(errors).toMatchInlineSnapshot(`
         {
           "description": "Server component error inside boundary",
           "environmentLabel": "Server",
           "label": "Runtime Error",
           "source": "app/suspense-in-root/static/server-error-inside-boundary/layout.tsx (7:9) @ ServerError
         >  7 |   throw new Error('Server component error inside boundary')
              |         ^",
           "stack": [
             "ServerError app/suspense-in-root/static/server-error-inside-boundary/layout.tsx (7:9)",
           ],
         }
        `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/server-error-inside-boundary'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
         "Error: Route "/suspense-in-root/static/server-error-inside-boundary": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.
             at ignore-listed frames
         Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
             at body (<anonymous>)
             at html (<anonymous>)
             at a (<anonymous>) {
           [cause]: Error: Server component error inside boundary
               at b (app/suspense-in-root/static/server-error-inside-boundary/layout.tsx:7:9)
              5 |
              6 | function ServerError() {
           >  7 |   throw new Error('Server component error inside boundary')
                |         ^
              8 | }
              9 |
             10 | export default async function Layout({ children }: { children: ReactNode }) { {
             digest: '<error-digest>'
           }
         }
         Build-time instant validation failed for route "/suspense-in-root/static/server-error-inside-boundary".
         To get a more detailed stack trace and pinpoint the issue, try one of the following:
           - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/server-error-inside-boundary" in your browser to investigate the error.
           - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
         Stopping prerender due to instant validation errors."
        `)
        expect(result.exitCode).toBe(1)
      }
    })
  })

  // Bug witness: a navigation signal — notFound(), redirect(), forbidden(),
  // unauthorized() — in a parent layout intentionally prevents the target
  // segment from rendering. That is control flow, not a failure to validate
  // instant UI, so it should NOT surface a "Could not validate `instant`"
  // error. Today it does: the target boundary never renders, so validation
  // reports the segment as unrendered / prevented-from-rendering.
  //
  // The correct fix (Josh Story) gates validation on the segments the *real*
  // render actually produced, so a signalled bail is never "required" and no
  // false positive is raised. Detecting the signal inside the validation pass
  // is not enough — the validation render is separate from the real render and
  // can't reliably tell an intentional bail from a divergent render. When the
  // rendered-segment-set fix lands, `it.failing` will itself fail — flip to
  // `it`.
  const navigationSignals = [
    {
      name: 'notFound',
      path: '/suspense-in-root/static/not-found-blocks-children',
    },
    {
      name: 'redirect',
      path: '/suspense-in-root/static/redirect-blocks-children',
    },
    {
      name: 'forbidden',
      path: '/suspense-in-root/static/forbidden-blocks-children',
    },
    {
      name: 'unauthorized',
      path: '/suspense-in-root/static/unauthorized-blocks-children',
    },
  ]

  describe.each(cases)(
    '$description - navigation signals',
    ({ isClientNav }) => {
      /* eslint-disable jest/no-standalone-expect */
      for (const { name, path } of navigationSignals) {
        // Only dev initial load reproduces the false positive deterministically;
        // client nav to a redirect changes the URL, and build handles the signal
        // as a normal response.
        ;(isNextDev && !isClientNav ? it.failing : it)(
          `${name}() in a parent layout is control flow, not a validation failure`,
          async () => {
            if (!isNextDev || isClientNav) return
            await next.browser(path)
            const output = await getDevCliValidationOutput(
              next.url + path,
              getCliOutputSinceMark
            )
            expect(output).not.toContain('Could not validate')
          }
        )
      }
      /* eslint-enable jest/no-standalone-expect */
    }
  )

  async function navigateViaClientNav(href: string): Promise<Playwright> {
    const browser = await next.browser('/suspense-in-root')
    await browser
      .elementByCss(`[data-link-type="soft"][href="${href}"]`)
      .click()

    await retry(
      async () => {
        expect(await browser.url()).toContain(href)
      },
      undefined,
      100,
      'wait for url to change'
    )

    return browser
  }
})
