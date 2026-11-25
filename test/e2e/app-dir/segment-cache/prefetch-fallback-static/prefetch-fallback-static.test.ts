import { nextTestSetup } from 'e2e-utils'

import { StaticAttemptHints } from 'next/src/shared/lib/app-router-types'
import { createRouterAct, waitForSuccessfulISRFallbackRetry } from 'router-act'
import type * as Playwright from 'playwright'
import {
  HintsManifest,
  getHumanReadablePrefetchHints,
} from '../../../../lib/prefetch-hints'

function extractPrerenderedRouteInfo(cliOutput: string) {
  const before = 'Route (app)\n'
  const after =
    '' +
    '○  (Static)             prerendered as static content\n' +
    '◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content'

  const startIx = cliOutput.indexOf(before)
  if (startIx === -1) {
    throw new Error(
      `String not found in CLI output:\n${before}\n\nDid the CLI output format change?`
    )
  }

  const endIx = cliOutput.indexOf(after)
  if (endIx === -1) {
    throw new Error(
      `String not found in CLI output:\n${after}\n\nDid the CLI output format change?`
    )
  }

  return cliOutput.slice(startIx + before.length, endIx).trim()
}

// The legacy Vercel builder does not implement the Cache Components shell
// eligibility and upgrade behavior asserted here.
// @force-gate prefetching && (!deploy || adapter)
describe('Partial prefetching with static params and ISR fallbacks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // @force-gate start
  it('marks a page with static params as potentially statically prefetchable even if one of the prerendered params accessed runtime data', async () => {
    expect('\n' + extractPrerenderedRouteInfo(next.cliOutput) + '\n')
      .toMatchInlineSnapshot(`
     "
     ┌ ◐ /
     ├ ○ /_not-found
     ├   /static-for-some-params/[slug]
     │ ├ ◐ /static-for-some-params/[slug]
     │ ├ ○ /static-for-some-params/no-cookies
     │ └ ◐ /static-for-some-params/yes-cookies
     ├   /static-for-some-params/[slug]/ensure-static/prefetch
     │ ├ ◐ /static-for-some-params/[slug]/ensure-static/prefetch
     │ ├ ○ /static-for-some-params/no-cookies/ensure-static/prefetch
     │ └ ◐ /static-for-some-params/yes-cookies/ensure-static/prefetch
     └   /static-for-some-params/[slug]/ensure-static/shell
       ├ ◐ /static-for-some-params/[slug]/ensure-static/shell
       ├ ○ /static-for-some-params/no-cookies/ensure-static/shell
       └ ◐ /static-for-some-params/yes-cookies/ensure-static/shell
     "
    `)

    const hintsManifest: HintsManifest = await next.readJSON(
      '.next/server/prefetch-hints.json'
    )

    // we only care about the static hints, inlining is not relevant.
    const hintsMask = StaticAttemptHints

    // The page awaits static params, so:
    // - the shell can be static (ShouldAttemptStaticShell hint set),
    // - the prefetch can be static (ShouldAttemptStaticPrefetch hint set).
    expect(
      getHumanReadablePrefetchHints(
        hintsManifest['/static-for-some-params/[slug]'],
        hintsMask
      )
    ).toMatchInlineSnapshot(`
     {
       "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ShouldAttemptStaticNavigation | ...",
       "slots": {
         "children": {
           "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ShouldAttemptStaticNavigation | ...",
           "slots": {
             "children": {
               "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ShouldAttemptStaticNavigation | ...",
               "slots": {
                 "children": {
                   "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ShouldAttemptStaticNavigation | ...",
                   "slots": null,
                 },
               },
             },
           },
         },
       },
     }
    `)
  })

  /** Note: Intended to ensure that each test specifies what prefetch type is used for the link. */
  function linkAccordionSelector({
    href,
    prefetch,
  }: {
    href: string
    prefetch: 'auto' | true
  }) {
    return `[data-link-accordion="${href}"][data-prefetch="${prefetch}"]`
  }

  const STATIC_SHELL_CONTENT =
    'This page only accesses runtime data for some param values.'

  describe('when the param was not prerendered and an ISR fallback was served', () => {
    const usedSlugs = new Set<string>()
    /**
     * Used to prevent accidental slug re-use across tests.
     * The slugs have to be different for each test, because otherwise
     * a previous test may have already triggered ISR for that param and
     * not hit the ISR fallback anymore.
     * */
    const trackUsedSlug = (slug: string) => {
      if (usedSlugs.has(slug)) {
        throw new Error(
          `Slug "${slug}" has already been used by another test, ` +
            `so ISR may have already been triggered and the behavior will change`
        )
      }
      usedSlugs.add(slug)
      return slug
    }

    // To ensure that the pages that haven't been prerendered yet, we append
    // a unique cache-buster value to all slugs (passed to the index page via a search param)
    let unique: string = Date.now() + ''
    beforeEach(() => {
      unique = Date.now() + ''
    })
    const indexPageWithUnique = () => `/?unique=${unique}`
    const slugWithUnique = (slug: string) => `${slug}_u${unique}`

    describe('when the prefetch did not use runtime data during the prerender', () => {
      it('prefetch="auto": retries the static request, and does not use a runtime prefetch', async () => {
        let page: Playwright.Page
        const browser = await next.browser(indexPageWithUnique(), {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })
        // The route was not prerendered during build.
        // It does not use runtime data based on the slug.
        const slug = trackUsedSlug(slugWithUnique('not-prerendered_no-cookies'))
        const href = `/static-for-some-params/${slug}`
        const prefetch = 'auto'

        await act(
          async () => {
            // Reveal a prefetch-auto link to the route, but delay the initial request.
            await act(
              () =>
                browser
                  .elementByCss(linkAccordionSelector({ href, prefetch }))
                  .click(),
              [
                // Static shell/prefetch (based on hint) yields an ISR fallback
                {
                  includes: STATIC_SHELL_CONTENT,
                  kind: 'static',
                  block: true,
                },
                // It's a fallback, so it should not contain params.
                {
                  includes: `Slug: ${slug}`,
                  block: 'reject',
                },
              ]
            )
          },
          // After this act()'s callback, the initial request is resolved.
          // It yielded an ISR fallback, so the router should retry it.
          // But the retry is delayed, so initially nothing happens.
          'no-requests'
        )
        await waitForSuccessfulISRFallbackRetry(act, {
          includes: `Slug: ${slug}`,
          kind: 'static',
        })
      })

      it('prefetch={true}: waits for the ISR retry instead of using a runtime prefetch', async () => {
        let page: Playwright.Page
        const browser = await next.browser(indexPageWithUnique(), {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })
        // The route was not prerendered during build.
        // It does not use runtime data based on the slug.
        const slug = trackUsedSlug(slugWithUnique('not-prerendered_no-cookies'))
        const href = `/static-for-some-params/${slug}`
        const prefetch = true

        await act(
          async () => {
            // Reveal a prefetch-true link to the route, but delay the initial request.
            await act(
              () =>
                browser
                  .elementByCss(linkAccordionSelector({ href, prefetch }))
                  .click(),
              [
                // Static shell/prefetch (based on hint) yields an ISR fallback
                {
                  includes: STATIC_SHELL_CONTENT,
                  kind: 'static',
                  block: true,
                },
                // It's a fallback, so it should not contain params.
                {
                  includes: `Slug: ${slug}`,
                  block: 'reject',
                },
              ]
            )
          },
          // After this act()'s callback, the blocked static request is resolved.
          // It yielded an ISR fallback, so the router retries it. The retry is the
          // same request, still in flight, so the link waits for it instead of
          // sending a runtime prefetch.
          'no-requests'
        )

        await waitForSuccessfulISRFallbackRetry(act, {
          includes: `Slug: ${slug}`,
          kind: 'static',
        })
      })

      describe('with ensureStatic', () => {
        describe('ensureStatic = "shell"', () => {
          it('prefetch={true}: waits for the ISR retry instead of using a runtime prefetch', async () => {
            let page: Playwright.Page
            const browser = await next.browser(indexPageWithUnique(), {
              beforePageLoad(p: Playwright.Page) {
                page = p
              },
            })
            const act = createRouterAct(page, {
              includeAppShellRequests: true,
            })

            // The route was not prerendered during build.
            // It does not use runtime data based on the slug, and has `ensureStatic = "shell"`.
            // The `ensureStatic` config should not change the behavior from the default, because
            // it affects the shell, not the prefetch.
            const slug = trackUsedSlug(
              slugWithUnique('not-prerendered_no-cookies_es-shell')
            )
            const href = `/static-for-some-params/${slug}/ensure-static/shell`
            const prefetch = true

            await act(
              async () => {
                // Reveal a prefetch-true link to the route, but delay the initial request.
                await act(
                  () =>
                    browser
                      .elementByCss(linkAccordionSelector({ href, prefetch }))
                      .click(),
                  [
                    // Static shell/prefetch (based on hint) yields an ISR fallback
                    {
                      includes: STATIC_SHELL_CONTENT,
                      kind: 'static',
                      block: true,
                    },
                    // It's a fallback, so it should not contain params.
                    {
                      includes: `Slug: ${slug}`,
                      block: 'reject',
                    },
                  ]
                )
              },
              // After this act()'s callback, the blocked static request is resolved.
              // It yielded an ISR fallback, so the router retries it. The retry is the
              // same request, still in flight, so the link waits for it instead of
              // sending a runtime prefetch.
              'no-requests'
            )

            await waitForSuccessfulISRFallbackRetry(act, {
              includes: `Slug: ${slug}`,
              kind: 'static',
            })
          })
        })

        describe('ensureStatic = "prefetch"', () => {
          it('prefetch={true}: does not use a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
            let page: Playwright.Page
            const browser = await next.browser(indexPageWithUnique(), {
              beforePageLoad(p: Playwright.Page) {
                page = p
              },
            })
            const act = createRouterAct(page, {
              includeAppShellRequests: true,
            })

            // The route was not prerendered during build.
            // It does not use runtime data based on the slug, and has `ensureStatic = "prefetch"`.
            // The `ensureStatic` config should change the behavior from the default, because it
            // disallows using runtime prefetches altogether.
            const slug = trackUsedSlug(
              slugWithUnique('not-prerendered_no-cookies_es-prefetch')
            )
            const href = `/static-for-some-params/${slug}/ensure-static/prefetch`
            const prefetch = true

            await act(
              async () => {
                // Reveal a prefetch-true link to the route, but delay the initial request.
                await act(
                  () =>
                    browser
                      .elementByCss(linkAccordionSelector({ href, prefetch }))
                      .click(),
                  [
                    // Static shell/prefetch (based on hint) yields an ISR fallback
                    {
                      includes: STATIC_SHELL_CONTENT,
                      kind: 'static',
                      block: true,
                    },
                    // It's a fallback, so it should not contain params.
                    {
                      includes: `Slug: ${slug}`,
                      block: 'reject',
                    },
                  ]
                )
              },
              // After this act()'s callback, the blocked static request is resolved.
              // It yielded an ISR fallback, so the router retries it. The retry is the
              // same request, still in flight, so the link waits for it instead of
              // sending a runtime prefetch.
              'no-requests'
            )

            await waitForSuccessfulISRFallbackRetry(act, {
              includes: `Slug: ${slug}`,
              kind: 'static',
            })
          })
        })
      })
    })

    describe('when the prefetch used runtime data during the prerender', () => {
      // NOTE: The ISR fallback looks the same as in the no-runtime-data tests
      // above, because it can't know the slug. We only find out that the page
      // needs runtime data once the retry gets the concrete prerender.

      it('prefetch="auto": does not use a runtime prefetch', async () => {
        let page: Playwright.Page
        const browser = await next.browser(indexPageWithUnique(), {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // The route was not prerendered during build.
        // It used runtime data based on the slug.
        const slug = trackUsedSlug(
          slugWithUnique('not-prerendered_yes-cookies')
        )
        const href = `/static-for-some-params/${slug}`
        const prefetch = 'auto'

        await act(
          async () => {
            // Reveal a prefetch-auto link to the route, but delay the initial request.
            await act(
              () =>
                browser
                  .elementByCss(linkAccordionSelector({ href, prefetch }))
                  .click(),
              [
                // Static shell/prefetch (based on hint) yields an ISR fallback
                {
                  includes: STATIC_SHELL_CONTENT,
                  kind: 'static',
                  block: true,
                },
                // It's a fallback, so it should not contain params.
                {
                  includes: `Slug: ${slug}`,
                  block: 'reject',
                },
              ]
            )
          },
          // After this act()'s callback, the initial request is resolved.
          // It yielded an ISR fallback, so the router should retry it.
          // But the retry is delayed, so initially nothing happens.
          'no-requests'
        )

        await waitForSuccessfulISRFallbackRetry(act, {
          includes: `Slug: ${slug}`,
          kind: 'static',
        })
      })

      it('prefetch={true}: waits for the ISR retry, then uses a runtime prefetch because the page needs one', async () => {
        let page: Playwright.Page
        const browser = await next.browser(indexPageWithUnique(), {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // The route was not prerendered during build.
        // It used runtime data based on the slug.
        const slug = trackUsedSlug(
          slugWithUnique('not-prerendered_yes-cookies')
        )
        const href = `/static-for-some-params/${slug}`
        const prefetch = true

        await act(
          async () => {
            // Reveal a prefetch-true link to the route, but delay the initial request.
            await act(
              () =>
                browser
                  .elementByCss(linkAccordionSelector({ href, prefetch }))
                  .click(),
              [
                // Static shell/prefetch (based on hint) yields an ISR fallback
                {
                  includes: STATIC_SHELL_CONTENT,
                  kind: 'static',
                  block: true,
                },
                // It's a fallback, so it should not contain params.
                {
                  includes: `Slug: ${slug}`,
                  block: 'reject',
                },
              ]
            )
          },
          // After this act()'s callback, the blocked static request is resolved.
          // It yielded an ISR fallback, so the router retries it. The retry is the
          // same request, still in flight, so the link waits for it instead of
          // sending a runtime prefetch.
          'no-requests'
        )

        // The retried request yields a concrete prerender with params.
        // It also says that the route needs a runtime prefetch (because it used
        // runtime data) but we already did one.
        await act(async () => {
          await waitForSuccessfulISRFallbackRetry(act, {
            includes: `Slug: ${slug}`,
            kind: 'static',
            block: true,
          })
        }, [
          // After the outer act() callback, the blocked concrete response resolves.
          // The concrete page needs runtime data, so now the link uses a
          // runtime prefetch.
          {
            includes: `Runtime data accessed on ${slug}: true`,
            kind: 'runtime',
          },
        ])
      })

      describe('with ensureStatic', () => {
        describe('ensureStatic = "shell"', () => {
          it('prefetch={true}: waits for the ISR retry, then uses a runtime prefetch because the page needs one', async () => {
            let page: Playwright.Page
            const browser = await next.browser(indexPageWithUnique(), {
              beforePageLoad(p: Playwright.Page) {
                page = p
              },
            })
            const act = createRouterAct(page, {
              includeAppShellRequests: true,
            })
            // The route was not prerendered during build.
            // It used runtime data based on the slug, and has `ensureStatic = "shell"`.
            // The `ensureStatic` config should not affect the behavior here, because runtime
            // data is only used in the prefetch, not the shell.
            const slug = trackUsedSlug(
              slugWithUnique('not-prerendered_yes-cookies_es-shell')
            )
            const href = `/static-for-some-params/${slug}/ensure-static/shell`
            const prefetch = true

            await act(
              async () => {
                // Reveal a prefetch-true link to the route, but delay the initial request.
                await act(
                  () =>
                    browser
                      .elementByCss(linkAccordionSelector({ href, prefetch }))
                      .click(),
                  [
                    // Static shell/prefetch (based on hint) yields an ISR fallback
                    {
                      includes: STATIC_SHELL_CONTENT,
                      kind: 'static',
                      block: true,
                    },
                    // It's a fallback, so it should not contain params.
                    {
                      includes: `Slug: ${slug}`,
                      block: 'reject',
                    },
                  ]
                )
              },
              // After this act()'s callback, the blocked static request is resolved.
              // It yielded an ISR fallback, so the router retries it. The retry is the
              // same request, still in flight, so the link waits for it instead of
              // sending a runtime prefetch.
              'no-requests'
            )

            await act(async () => {
              await waitForSuccessfulISRFallbackRetry(act, {
                includes: `Slug: ${slug}`,
                kind: 'static',
                block: true,
              })
            }, [
              // After the outer act() callback, the blocked concrete response resolves.
              // The concrete page needs runtime data, so now the link uses a
              // runtime prefetch.
              {
                includes: `Runtime data accessed on ${slug}: true`,
                kind: 'runtime',
              },
            ])
          })
        })

        describe('ensureStatic = "prefetch"', () => {
          it('prefetch={true}: does not use a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
            let page: Playwright.Page
            const browser = await next.browser(indexPageWithUnique(), {
              beforePageLoad(p: Playwright.Page) {
                page = p
              },
            })
            const act = createRouterAct(page, {
              includeAppShellRequests: true,
            })

            // The route was not prerendered during build.
            // It used runtime data based on the slug, and has `ensureStatic = "prefetch"`.
            // The `ensureStatic` config SHOULD change the behavior here -- we should ignore the
            // fact that runtime data was used, and only use static requests anyway.
            const slug = trackUsedSlug(
              slugWithUnique('not-prerendered_yes-cookies_es-prefetch')
            )
            const href = `/static-for-some-params/${slug}/ensure-static/prefetch`
            const prefetch = true

            await act(
              async () => {
                // Reveal a prefetch-true link to the route, but delay the initial request.
                await act(
                  () =>
                    browser
                      .elementByCss(linkAccordionSelector({ href, prefetch }))
                      .click(),
                  [
                    // Static shell/prefetch (based on hint) yields an ISR fallback
                    {
                      includes: STATIC_SHELL_CONTENT,
                      kind: 'static',
                      block: true,
                    },
                    // It's a fallback, so it should not contain params.
                    {
                      includes: `Slug: ${slug}`,
                      block: 'reject',
                    },
                  ]
                )
              },
              // After this act()'s callback, the blocked static request is resolved.
              // It yielded an ISR fallback, so the router retries it. The retry is the
              // same request, still in flight, so the link waits for it instead of
              // sending a runtime prefetch.
              'no-requests'
            )

            await waitForSuccessfulISRFallbackRetry(act, {
              includes: `Slug: ${slug}`,
              kind: 'static',
            })
          })
        })
      })
    })
  })
})
