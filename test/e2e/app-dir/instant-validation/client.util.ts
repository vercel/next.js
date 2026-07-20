import {
  expectNoBuildValidationErrors,
  extractBuildValidationError,
  waitForValidation,
} from 'e2e-utils/instant-validation'
import {
  openRedbox,
  waitForNoErrorToast,
  waitForRedbox,
} from '../../../lib/next-test-utils'
import {
  createRedboxSnapshot,
  type ErrorSnapshot,
  type RedboxSnapshot,
} from '../../../lib/add-redbox-matchers'
import {
  NO_VALIDATION_ERRORS_WAIT,
  type InstantValidationCaseContext,
} from './harness.util'

export function registerClientTests(ctx: InstantValidationCaseContext) {
  const {
    next,
    isNextDev,
    isClientNav,
    navigateTo,
    expectNoDevValidationErrors,
    getCliOutputSinceMark,
    prerender,
  } = ctx

  describe('client components', () => {
    it('unable to validate - parent suspends on client data and blocks children', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-client-data-blocks-validation'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
           {
             "cause": [
               {
                 "label": "Caused by: Instant Validation",
                 "source": "app/suspense-in-root/static/invalid-client-data-blocks-validation/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
                 "stack": [
                   "instant app/suspense-in-root/static/invalid-client-data-blocks-validation/page.tsx (1:24)",
                   "Set.forEach <anonymous>",
                 ],
               },
             ],
             "code": "E1331",
             "description": "Route "/suspense-in-root/static/invalid-client-data-blocks-validation": Could not validate \`instant\` because a Client Component in a parent segment prevented the page from rendering.",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": "app/suspense-in-root/static/invalid-client-data-blocks-validation/client.tsx (12:19) @ FetchesClientData
           > 12 |   const data = use(promise)
                |                   ^",
             "stack": [
               "FetchesClientData app/suspense-in-root/static/invalid-client-data-blocks-validation/client.tsx (12:19)",
               "Layout app/suspense-in-root/static/invalid-client-data-blocks-validation/layout.tsx (21:11)",
             ],
           }
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-client-data-blocks-validation'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "client-data-fetching-lib :: MISS my-key
           client-data-fetching-lib :: MISS my-key
           client-data-fetching-lib :: MISS my-key
           Error: Route "/suspense-in-root/static/invalid-client-data-blocks-validation": Could not validate \`instant\` because a Client Component in a parent segment prevented the page from rendering.
               at <unknown> (app/suspense-in-root/static/invalid-client-data-blocks-validation/client.tsx:6:37)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
             4 | import { useDataCache } from '../../../../client-data-fetching-lib/client'
             5 |
           > 6 | export function FetchesClientData({ children }) {
               |                                     ^
             7 |   const dataCache = useDataCache()
             8 |   const promise = dataCache.getOrLoad('my-key', async () => {
             9 |     await new Promise<void>((resolve) => setTimeout(resolve, 10))
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-client-data-blocks-validation".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/invalid-client-data-blocks-validation" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('valid - parent suspends on client data but does not block children', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-data-does-not-block-validation'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-data-does-not-block-validation'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - parent uses sync IO in a client component', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-api-in-parent/sync-io'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-api-in-parent/sync-io'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - parent uses dynamic usePathname() in a client component', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-api-in-parent/dynamic-params/123'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-api-in-parent/dynamic-params/[id]'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - parent uses useSearchParams() in a client component', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-api-in-parent/search-params'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-api-in-parent/search-params'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - unguarded params in client page', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-params/123'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-params/[slug]'
        )
        expectNoBuildValidationErrors(result)
      }
    })

    it('valid - unguarded searchParams in client page', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-search-params?query=foo'
        )
        await expectNoDevValidationErrors(browser, await browser.url())
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-search-params'
        )
        expectNoBuildValidationErrors(result)
      }
    })
  })

  describe('client errors', () => {
    function removeExpectedError(
      errors: RedboxSnapshot,
      shouldRemove: (error: ErrorSnapshot) => boolean
    ): ErrorSnapshot[] {
      if (!Array.isArray(errors)) {
        throw new Error('Expected to receive multiple errors to filter')
      }
      let found = false
      const result = errors.filter((err) => {
        if (shouldRemove(err)) {
          found = true
          return false
        } else {
          return true
        }
      })
      if (!found) {
        throw new Error(
          `Did not find expected error in errors array: ${JSON.stringify(errors, null, 2)}`
        )
      }
      return result
    }

    it('unable to validate - client error in parent blocks children', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-client-error-in-parent-blocks-children'
        )
        // We expect a collapsed redbox. We need to open it to assert on the messages.
        await openRedbox(browser)

        let errors = await createRedboxSnapshot(browser, next)

        if (!isClientNav) {
          // In SSR, we expect a "Switched to client rendering ..." error because we deliberately throw in a client component.
          // However, the timing of when it appears is inconsistent -- sometimes it's before validation errors,
          // and sometimes it's after.
          // To avoid flakiness, we filter it out (but assert that it appears in the redbox)
          errors = removeExpectedError(errors, (err) => {
            return (
              err.label === 'Recoverable Error' &&
              err.description.startsWith(
                'Switched to client rendering because the server rendering errored:\n\nNo SSR please'
              )
            )
          })
        }

        expect(errors).toMatchInlineSnapshot(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/page.tsx (1:24)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "No SSR please",
                   "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx (5:11) @ ErrorInSSR
           > 5 |     throw new Error('No SSR please')
               |           ^",
                   "stack": [
                     "ErrorInSSR app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx (5:11)",
                   ],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/layout.tsx (19:11) @ Layout
           > 19 |           <ErrorInSSR>{children}</ErrorInSSR>
                |           ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/layout.tsx (19:11)",
               ],
             },
           ]
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-client-error-in-parent-blocks-children'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx:3:30)
               at a (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>)
             1 | 'use client'
             2 |
           > 3 | export function ErrorInSSR({ children }) {
               |                              ^
             4 |   if (typeof window === 'undefined') {
             5 |     throw new Error('No SSR please')
             6 |   } {
             [cause]: Error: No SSR please
                 at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-blocks-children/client.tsx:5:11)
               3 | export function ErrorInSSR({ children }) {
               4 |   if (typeof window === 'undefined') {
             > 5 |     throw new Error('No SSR please')
                 |           ^
               6 |   }
               7 |   return <>{children}</>
               8 | }
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/invalid-client-error-in-parent-blocks-children" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('unable to validate - client error in component from node_modules blocks children', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-error-in-node-modules-blocks-children'
        )
        // We expect a collapsed redbox. We need to open it to assert on the messages.
        await openRedbox(browser)

        let errors = await createRedboxSnapshot(browser, next)

        if (!isClientNav) {
          // In SSR, we expect a "Switched to client rendering ..." error because we deliberately throw in a client component.
          // However, the timing of when it appears is inconsistent -- sometimes it's before validation errors,
          // and sometimes it's after.
          // To avoid flakiness, we filter it out (but assert that it appears in the redbox)
          errors = removeExpectedError(errors, (err) => {
            return (
              err.label === 'Recoverable Error' &&
              err.description.startsWith(
                'Switched to client rendering because the server rendering errored:\n\nError from node_modules'
              )
            )
          })
        }

        expect(errors).toMatchInlineSnapshot(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/page.tsx (1:24)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "Error from node_modules",
                   "source": null,
                   "stack": [],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/layout.tsx (21:11) @ Layout
           > 21 |           <ErrorInSSRFromPackage>{children}</ErrorInSSRFromPackage>
                |           ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-error-in-node-modules-blocks-children/layout.tsx (21:11)",
               ],
             },
           ]
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-error-in-node-modules-blocks-children'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at a (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at b (<anonymous>) {
             [cause]: Error: Error from node_modules
                 at ignore-listed frames
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/invalid-error-in-node-modules-blocks-children" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('unable to validate - CSR bailout from next/dynamic blocks children', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-csr-bailout-blocks-children'
        )
        await expect(browser).toDisplayCollapsedRedbox(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-csr-bailout-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-csr-bailout-blocks-children/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/invalid-csr-bailout-blocks-children/page.tsx (1:24)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "Bail out to client-side rendering: next/dynamic",
                   "source": null,
                   "stack": [],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-csr-bailout-blocks-children/layout.tsx (19:9) @ Layout
           > 19 |         <LazyClientWrapperWithNoSSR>{children}</LazyClientWrapperWithNoSSR>
                |         ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-csr-bailout-blocks-children/layout.tsx (19:9)",
               ],
             },
           ]
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-csr-bailout-blocks-children'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-csr-bailout-blocks-children": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at a (<anonymous>)
               at b (<anonymous>)
               at div (<anonymous>)
               at body (<anonymous>)
               at html (<anonymous>)
               at c (<anonymous>) {
             [cause]: Error: Bail out to client-side rendering: next/dynamic
                 at ignore-listed frames {
               reason: 'next/dynamic',
               digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
             }
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-csr-bailout-blocks-children".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/invalid-csr-bailout-blocks-children" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('unable to validate - client error from sibling of children slot without suspense', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/invalid-client-error-in-parent-sibling'
        )

        if (isClientNav) {
          // In a client navigation, the redbox will be collapsed.
          await openRedbox(browser)
        } else {
          // In SSR, the redbox will be open due to the missing tags error.
          await waitForRedbox(browser)
        }

        let errors = await createRedboxSnapshot(browser, next)
        if (!isClientNav) {
          // In SSR, we expect a "Switched to client rendering ..." error because we deliberately throw in a client component.
          // However, the timing of when it appears is inconsistent -- sometimes it's before validation errors,
          // and sometimes it's after.
          // To avoid flakiness, we filter it out (but assert that it appears in the redbox)
          errors = removeExpectedError(errors, (err) => {
            return (
              err.label === 'Runtime Error' &&
              err.description.startsWith(
                'Missing <html> and <body> tags in the root layout.'
              )
            )
          })
        }

        expect(errors).toMatchInlineSnapshot(`
           [
             {
               "description": "Route "/suspense-in-root/static/invalid-client-error-in-parent-sibling": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/page.tsx (1:24) @ instant
           > 1 | export const instant = { level: 'experimental-error' }
               |                        ^",
               "stack": [
                 "instant app/suspense-in-root/static/invalid-client-error-in-parent-sibling/page.tsx (1:24)",
               ],
             },
             {
               "cause": [
                 {
                   "label": "Caused by: Error",
                   "message": "No SSR please",
                   "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx (5:11) @ ErrorInSSR
           > 5 |     throw new Error('No SSR please')
               |           ^",
                   "stack": [
                     "ErrorInSSR app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx (5:11)",
                   ],
                 },
               ],
               "code": "E1118",
               "description": "An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/suspense-in-root/static/invalid-client-error-in-parent-sibling/layout.tsx (20:7) @ Layout
           > 20 |       <ErrorInSSR />
                |       ^",
               "stack": [
                 "Layout app/suspense-in-root/static/invalid-client-error-in-parent-sibling/layout.tsx (20:7)",
               ],
             },
           ]
          `)
      } else {
        const result = await prerender(
          '/suspense-in-root/static/invalid-client-error-in-parent-sibling'
        )
        expect(extractBuildValidationError(result.cliOutput))
          .toMatchInlineSnapshot(`
           "Error: Route "/suspense-in-root/static/invalid-client-error-in-parent-sibling": Could not validate \`instant\` because the target segment was prevented from rendering, likely due to the following error.
               at ignore-listed frames
           Error: An error occurred while attempting to validate instant UI. This error may be preventing the validation from completing.
               at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx:5:11)
               at body (<anonymous>)
               at html (<anonymous>)
               at a (<anonymous>)
             3 | export function ErrorInSSR() {
             4 |   if (typeof window === 'undefined') {
           > 5 |     throw new Error('No SSR please')
               |           ^
             6 |   }
             7 |   return <div>Hello, browser!</div>
             8 | } {
             [cause]: Error: No SSR please
                 at <unknown> (app/suspense-in-root/static/invalid-client-error-in-parent-sibling/client.tsx:5:11)
               3 | export function ErrorInSSR() {
               4 |   if (typeof window === 'undefined') {
             > 5 |     throw new Error('No SSR please')
                 |           ^
               6 |   }
               7 |   return <div>Hello, browser!</div>
               8 | }
           }
           Build-time instant validation failed for route "/suspense-in-root/static/invalid-client-error-in-parent-sibling".
           To get a more detailed stack trace and pinpoint the issue, try one of the following:
             - Start the app in development mode by running \`next dev\`, then open "/suspense-in-root/static/invalid-client-error-in-parent-sibling" in your browser to investigate the error.
             - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces.
           Stopping prerender due to instant validation errors."
          `)
        expect(result.exitCode).toBe(1)
      }
    })

    it('valid - client error from sibling of children slot with suspense', async () => {
      if (isNextDev) {
        const browser = await navigateTo(
          '/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation'
        )
        await waitForValidation(await browser.url(), getCliOutputSinceMark)
        if (isClientNav) {
          // In a client nav, no errors should be reported.
          await waitForNoErrorToast(browser, NO_VALIDATION_ERRORS_WAIT)
        } else {
          // In SSR, we expect to only see the error coming from react.
          await expect(browser).toDisplayCollapsedRedbox(`
              {
                "description": "Switched to client rendering because the server rendering errored:

              No SSR please",
                "environmentLabel": null,
                "label": "Recoverable Error",
                "source": "app/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation/client.tsx (5:11) @ ErrorInSSR
              > 5 |     throw new Error('No SSR please')
                  |           ^",
                "stack": [
                  "ErrorInSSR app/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation/client.tsx (5:11)",
                ],
              }
          `)
        }
      } else {
        const result = await prerender(
          '/suspense-in-root/static/valid-client-error-in-parent-does-not-block-validation'
        )
        expectNoBuildValidationErrors(result)
      }
    })
  })
}
