import { nextTestSetup } from 'e2e-utils'

import { PrefetchHint } from 'next/src/shared/lib/app-router-types'
import { createRouterAct } from 'router-act'
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
     ┌ ○ /
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
    const hintsMask =
      PrefetchHint.ShouldAttemptStaticShell |
      PrefetchHint.ShouldAttemptStaticPrefetch

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
       "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ...",
       "slots": {
         "children": {
           "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ...",
           "slots": {
             "children": {
               "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ...",
               "slots": {
                 "children": {
                   "hints": "ShouldAttemptStaticShell | ShouldAttemptStaticPrefetch | ...",
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
    /** The router waits 2s before retrying ISR fallbacks. */
    const ISR_RETRY_DELAY = 2000 + 500

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

    describe('when the prefetch did not use runtime data during the prerender', () => {
      it('prefetch="auto": retries the static request, and does not use a runtime prefetch', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })
        // The route was not prerendered during build.
        // It does not use runtime data based on the slug.
        const slug = trackUsedSlug('not-prerendered_no-cookies_prefetch-auto')
        const href = `/static-for-some-params/${slug}`
        const prefetch = 'auto'
        await act(async () => {
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
          // Wait for the router to do a retry.
          await new Promise((resolve) => setTimeout(resolve, ISR_RETRY_DELAY))
        }, [
          // The retried request yields a concrete prerender with params.
          {
            includes: `Slug: ${slug}`,
            kind: 'static',
          },
          // NO Runtime prefetch to get the content (not requested by link)
          // or runtime requests of any kind
          {
            includes: '',
            kind: 'runtime',
            block: 'reject',
          },
        ])
      })

      it('prefetch={true}: uses a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })
        // The route was not prerendered during build.
        // It does not use runtime data based on the slug.
        const slug = trackUsedSlug('not-prerendered_no-cookies_prefetch-true')
        const href = `/static-for-some-params/${slug}`
        const prefetch = true

        await act(async () => {
          await act(async () => {
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
          }, [
            // After this act()'s callback, the blocked static request is resolved.
            // The router sees that it's an ISR fallback and kicks off the ISR retry loop.
            // It should also decide to do runtime prefetch, because the link needs one,
            // and ISR fallbacks indicate that a runtime prefetch can be used to get the content.
            {
              includes: `Runtime data accessed on ${slug}: false`,
              kind: 'runtime',
            },
          ])
          // Wait for the router to do a retry.
          await new Promise((resolve) => setTimeout(resolve, ISR_RETRY_DELAY))
        }, [
          // The retried request yields a concrete prerender with params.
          {
            includes: `Slug: ${slug}`,
            kind: 'static',
          },
        ])
      })

      describe('with ensureStatic', () => {
        describe('ensureStatic = "shell"', () => {
          // FIXME: Flaky test
          // @force-gate !deploy
          it('prefetch={true}: uses a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
            let page: Playwright.Page
            const browser = await next.browser('/', {
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
              'not-prerendered_no-cookies_ensure-static-shell'
            )
            const href = `/static-for-some-params/${slug}/ensure-static/shell`
            const prefetch = true

            await act(async () => {
              await act(async () => {
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
              }, [
                // After this act()'s callback, the blocked static request is resolved.
                // The router sees that it's an ISR fallback and kicks off the ISR retry loop.
                // It should also decide to do runtime prefetch, because the link needs one,
                // and ISR fallbacks indicate that a runtime prefetch can be used to get the content.
                // (this should not be affected by `ensureStatic = "shell"`)
                {
                  includes: `Runtime data accessed on ${slug}: false`,
                  kind: 'runtime',
                },
              ])
              // Wait for the router to do a retry.
              await new Promise((resolve) =>
                setTimeout(resolve, ISR_RETRY_DELAY)
              )
            }, [
              // The retried request yields a concrete prerender with params.
              {
                includes: `Slug: ${slug}`,
                kind: 'static',
              },
            ])
          })
        })

        describe('ensureStatic = "prefetch"', () => {
          // FIXME: Flaky test
          // @force-gate !deploy
          it('prefetch={true}: does not use a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
            let page: Playwright.Page
            const browser = await next.browser('/', {
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
              'not-prerendered_no-cookies_ensure-static-prefetch'
            )
            const href = `/static-for-some-params/${slug}/ensure-static/prefetch`
            const prefetch = true

            await act(async () => {
              await act(async () => {
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
              }, [
                // After this act()'s callback, the blocked static request is resolved.
                // The router sees that it's an ISR fallback and kicks off the ISR retry loop.
                // Unlike the default behavior, it should NOT use a runtime request for the
                // missing content, because the route has `ensureStatic = "prefetch"`, so
                // runtime prefetches are not allowed.
                {
                  includes: '',
                  kind: 'runtime',
                  block: 'reject',
                },
              ])
              // Wait for the router to do a retry.
              await new Promise((resolve) =>
                setTimeout(resolve, ISR_RETRY_DELAY)
              )
            }, [
              // The retried request yields a concrete prerender with params.
              {
                includes: `Slug: ${slug}`,
                kind: 'static',
              },
              {
                includes: '',
                kind: 'runtime',
                block: 'reject',
              },
            ])
          })
        })
      })
    })

    describe('when the prefetch used runtime data during the prerender', () => {
      // NOTE: This is essentially the same as the no-runtime-data tests above,
      // because we do a runtime prefetch based on the ISR fallback itself
      // (assuming the link allows it), before we find out that the concrete prerender
      // used runtime data and merits a runtime prefetch.

      // FIXME: Flaky test
      // @force-gate !deploy
      it('prefetch="auto": does not use a runtime prefetch', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // The route was not prerendered during build.
        // It used runtime data based on the slug.
        const slug = trackUsedSlug('not-prerendered_yes-cookies_prefetch-auto')
        const href = `/static-for-some-params/${slug}`
        const prefetch = 'auto'

        await act(async () => {
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

          // Wait for the router to do a retry.
          await new Promise((resolve) => setTimeout(resolve, ISR_RETRY_DELAY))
        }, [
          // The retried request yields a concrete prerender with params.
          {
            includes: `Slug: ${slug}`,
            kind: 'static',
          },

          // NO Runtime prefetch to get the content (not requested by link)
          // or runtime requests of any kind
          {
            includes: '',
            kind: 'runtime',
            block: 'reject',
          },
        ])
      })

      // FIXME: Flaky test
      // @force-gate !deploy
      it('prefetch={true}: uses a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
        let page: Playwright.Page
        const browser = await next.browser('/', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        const act = createRouterAct(page, { includeAppShellRequests: true })

        // The route was not prerendered during build.
        // It used runtime data based on the slug.
        const slug = trackUsedSlug('not-prerendered_yes-cookies_prefetch-true')
        const href = `/static-for-some-params/${slug}`
        const prefetch = true

        await act(async () => {
          await act(async () => {
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
          }, [
            // After this act()'s callback, the blocked static request is resolved.
            // The router sees that it's an ISR fallback and kicks off the ISR retry loop.
            // It should also decide to do runtime prefetch, because the link needs one,
            // and ISR fallbacks indicate that a runtime prefetch can be used to get the content.
            {
              includes: `Runtime data accessed on ${slug}: true`,
              kind: 'runtime',
            },
          ])
          // Wait for the router to do a retry.
          await new Promise((resolve) => setTimeout(resolve, ISR_RETRY_DELAY))
        }, [
          // The retried request yields a concrete prerender with params.
          // It also says that the route needs a runtime prefetch (because it used
          // runtime data) but we already did one.
          {
            includes: `Slug: ${slug}`,
            kind: 'static',
          },
        ])
      })

      describe('with ensureStatic', () => {
        describe('ensureStatic = "shell"', () => {
          // FIXME: Flaky test
          // @force-gate !deploy
          it('prefetch={true}: uses a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
            let page: Playwright.Page
            const browser = await next.browser('/', {
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
              'not-prerendered_yes-cookies_ensure-static-shell'
            )
            const href = `/static-for-some-params/${slug}/ensure-static/shell`
            const prefetch = true

            await act(async () => {
              await act(async () => {
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
              }, [
                // After this act()'s callback, the blocked static request is resolved.
                // The router sees that it's an ISR fallback and kicks off the ISR retry loop.
                // It should also decide to do runtime prefetch, because the link needs one,
                // and ISR fallbacks indicate that a runtime prefetch can be used to get the content.
                // (this should not be affected by `ensureStatic = "shell"`)
                {
                  includes: `Runtime data accessed on ${slug}: true`,
                  kind: 'runtime',
                },
              ])
              // Wait for the router to do a retry.
              await new Promise((resolve) =>
                setTimeout(resolve, ISR_RETRY_DELAY)
              )
            }, [
              // The retried request yields a concrete prerender with params.
              {
                includes: `Slug: ${slug}`,
                kind: 'static',
              },
            ])
          })
        })

        describe('ensureStatic = "prefetch"', () => {
          // FIXME: Flaky test
          // @force-gate !deploy
          it('prefetch={true}: does not use a runtime prefetch as a replacement for not-yet-available ISR content', async () => {
            let page: Playwright.Page
            const browser = await next.browser('/', {
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
              'not-prerendered_yes-cookies_ensure-static-prefetch'
            )
            const href = `/static-for-some-params/${slug}/ensure-static/prefetch`
            const prefetch = true

            await act(async () => {
              await act(async () => {
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
              }, [
                // After this act()'s callback, the blocked static request is resolved.
                // The router sees that it's an ISR fallback and kicks off the ISR retry loop.
                // Unlike the default behavior, it should NOT use a runtime request for the
                // missing content, because the route has `ensureStatic = "prefetch"`, so
                // runtime prefetches are not allowed.
                {
                  includes: '',
                  kind: 'runtime',
                  block: 'reject',
                },
              ])
              // Wait for the router to do a retry.
              await new Promise((resolve) =>
                setTimeout(resolve, ISR_RETRY_DELAY)
              )
            }, [
              // The retried request yields a concrete prerender with params.
              {
                includes: `Slug: ${slug}`,
                kind: 'static',
              },
              {
                includes: '',
                kind: 'runtime',
                block: 'reject',
              },
            ])
          })
        })
      })
    })
  })
})
