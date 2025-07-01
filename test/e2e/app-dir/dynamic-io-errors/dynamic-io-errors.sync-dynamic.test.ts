import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertLog, getPrerenderOutput } from './utils'

describe.each(
  isNextDev
    ? [
        {
          inPrerenderDebugMode: false,
          name: 'Dev',
        },
      ]
    : [
        {
          inPrerenderDebugMode: false,
          name: 'Build Without --prerender-debug',
        },
        {
          inPrerenderDebugMode: true,
          name: 'Build With --prerender-debug',
        },
      ]
)('Dynamic IO Errors - $name', ({ inPrerenderDebugMode }) => {
  describe('Sync Dynamic - client searchParams', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-client-search',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should return `undefined` for `searchParams.foo`', async () => {
        const browser = await next.browser('/?foo=test')

        expect(await browser.elementById('foo-param').text()).toBe('undefined')
      })

      it('should show a collapsed redbox with a sync access error', async () => {
        const browser = await next.browser('/?foo=test')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "A searchParam property was accessed directly with \`searchParams.foo\`. \`searchParams\` should be unwrapped with \`React.use()\` before accessing its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
           "environmentLabel": null,
           "label": "Console Error",
           "source": "app/page.tsx (26:5) @ SearchParamsReadingComponent
         > 26 |   ).foo
              |     ^",
           "stack": [
             "SearchParamsReadingComponent app/page.tsx (26:5)",
             "Page app/page.tsx (14:7)",
           ],
         }
        `)
      })
    } else {
      it('should not error the build when synchronously reading `searchParams.foo`', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const browser = await next.browser('/?foo=test')
        expect(await browser.elementById('foo-param').text()).toBe('undefined')
      })
    }
  })

  describe('Sync Dynamic - server searchParams', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-server-search',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should return `undefined` for `searchParams.foo`', async () => {
        const browser = await next.browser('/?foo=test')

        expect(await browser.elementById('foo-param').text()).toBe('undefined')
      })

      it('should show a collapsed redbox with a sync access error', async () => {
        const browser = await next.browser('/?foo=test')

        await expect(browser).toDisplayCollapsedRedbox(`
         {
           "description": "Route "/" used \`searchParams.foo\`. \`searchParams\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
           "environmentLabel": "Prerender",
           "label": "Console Error",
           "source": "app/page.tsx (26:5) @ SearchParamsReadingComponent
         > 26 |   ).foo
              |     ^",
           "stack": [
             "SearchParamsReadingComponent app/page.tsx (26:5)",
             "Page app/page.tsx (14:7)",
           ],
         }
        `)
      })
    } else {
      it('should not error the build when synchronously reading `searchParams.foo`', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const browser = await next.browser('/?foo=test')
        expect(await browser.elementById('foo-param').text()).toBe('undefined')
      })
    }
  })

  describe('Sync Dynamic - cookies', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-cookies',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should show a redbox with a sync access error and a runtime error', async () => {
        const browser = await next.browser('/')

        if (isTurbopack) {
          await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Route "/" used \`cookies().get\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:26) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                          ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:26)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <turbopack-module-id>.cookies)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:67) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                                                                   ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:67)",
               ],
             },
           ]
          `)
        } else {
          await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Route "/" used \`cookies().get\`. \`cookies()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:18) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                  ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:18)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <webpack-module-id>.cookies)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:67) @ CookiesReadingComponent
           > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                |                                                                   ^",
               "stack": [
                 "CookiesReadingComponent app/page.tsx (17:67)",
               ],
             },
           ]
          `)
        }
      })
    } else {
      it('should error the build with a runtime error', async () => {
        try {
          await next.build()
        } catch {
          // we expect the build to fail
        }

        const output = getPrerenderOutput(next.cliOutput, {
          isMinified: !inPrerenderDebugMode,
        })

        if (isTurbopack) {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at CookiesReadingComponent (turbopack:///[project]/app/page.tsx:17:66)
                 at stringify (<anonymous>)
               15 |
               16 | async function CookiesReadingComponent() {
             > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                                                                  ^
               18 |   return <div>this component reads the \`token\` cookie synchronously</div>
               19 | }
               20 | {
               digest: '<error-digest>'
             }

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at a (<next-dist-dir>)
                 at b (<anonymous>) {
               digest: '<error-digest>'
             }
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at CookiesReadingComponent (webpack:///app/page.tsx:17:66)
                 at stringify (<anonymous>)
               15 |
               16 | async function CookiesReadingComponent() {
             > 17 |   const _token = (cookies() as unknown as UnsafeUnwrappedCookies).get('token')
                  |                                                                  ^
               18 |   return <div>this component reads the \`token\` cookie synchronously</div>
               19 | }
               20 | {
               digest: '<error-digest>'
             }

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at a (<next-dist-dir>)
                 at b (<anonymous>) {
               digest: '<error-digest>'
             }
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Sync Dynamic - draftMode', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-draft-mode',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should return `undefined` for `draftMode().isEnabled`', async () => {
        const browser = await next.browser('/')

        expect(await browser.elementById('draft-mode').text()).toBe('undefined')
      })

      it('should show a collapsed redbox with a sync access error', async () => {
        const browser = await next.browser('/')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/page.tsx (18:31) @ DraftModeReadingComponent
           > 18 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                |                               ^",
             "stack": [
               "DraftModeReadingComponent app/page.tsx (18:31)",
               "Page app/page.tsx (11:7)",
             ],
           }
          `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/" used \`draftMode().isEnabled\`. \`draftMode()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Prerender",
             "label": "Console Error",
             "source": "app/page.tsx (18:21) @ DraftModeReadingComponent
           > 18 |   const isEnabled = (draftMode() as unknown as UnsafeUnwrappedDraftMode)
                |                     ^",
             "stack": [
               "DraftModeReadingComponent app/page.tsx (18:21)",
               "Page app/page.tsx (11:7)",
             ],
           }
          `)
        }
      })
    } else {
      it('should not error the build when synchronously reading `draftMode().isEnabled`', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail')
        }

        expect(next.cliOutput).toContain('○ / ')
        const $ = await next.render$('/')
        expect($('#draft-mode').text()).toBe('undefined')
      })
    }
  })

  describe('Sync Dynamic - headers', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-headers',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should show a redbox with a sync access error and a runtime error', async () => {
        const browser = await next.browser('/')

        if (isTurbopack) {
          await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Route "/" used \`headers().get\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:29) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                             ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:29)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <turbopack-module-id>.headers)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:70) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                                                                      ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:70)",
               ],
             },
           ]
          `)
        } else {
          await expect(browser).toDisplayRedbox(`
           [
             {
               "description": "Route "/" used \`headers().get\`. \`headers()\` should be awaited before using its value. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Prerender",
               "label": "Console Error",
               "source": "app/page.tsx (17:21) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                     ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:21)",
                 "Page app/page.tsx (11:7)",
               ],
             },
             {
               "description": "(0 , <webpack-module-id>.headers)(...).get is not a function",
               "environmentLabel": "Prerender",
               "label": "Runtime TypeError",
               "source": "app/page.tsx (17:70) @ HeadersReadingComponent
           > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                |                                                                      ^",
               "stack": [
                 "HeadersReadingComponent app/page.tsx (17:70)",
               ],
             },
           ]
          `)
        }
      })
    } else {
      it('should error the build with a runtime error', async () => {
        try {
          await next.build()
        } catch {
          // we expect the build to fail
        }

        const output = getPrerenderOutput(next.cliOutput, {
          isMinified: !inPrerenderDebugMode,
        })

        if (isTurbopack) {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at HeadersReadingComponent (turbopack:///[project]/app/page.tsx:17:69)
                 at stringify (<anonymous>)
               15 |
               16 | async function HeadersReadingComponent() {
             > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                     ^
               18 |     'user-agent'
               19 |   )
               20 |   return ( {
               digest: '<error-digest>'
             }

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at a (<next-dist-dir>)
                 at b (<anonymous>) {
               digest: '<error-digest>'
             }
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at HeadersReadingComponent (webpack:///app/page.tsx:17:69)
                 at stringify (<anonymous>)
               15 |
               16 | async function HeadersReadingComponent() {
             > 17 |   const userAgent = (headers() as unknown as UnsafeUnwrappedHeaders).get(
                  |                                                                     ^
               18 |     'user-agent'
               19 |   )
               20 |   return ( {
               digest: '<error-digest>'
             }

             > Export encountered errors on following paths:
             	/page: /"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error
             TypeError: <module-function>().get is not a function
                 at a (<next-dist-dir>)
                 at b (<anonymous>) {
               digest: '<error-digest>'
             }
             Export encountered an error on /page: /, exiting the build."
            `)
          }
        }
      })
    }
  })

  describe('Sync Dynamic - With Fallback - params', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-params-with-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      // We don't error the build, but we do show a dev-only error so that users
      // migrate to the async usage.
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/test')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/[slug]/page.tsx (32:23) @ ParamsReadingComponent
             > 32 |   const slug = params.slug
                  |                       ^",
               "stack": [
                 "ParamsReadingComponent app/[slug]/page.tsx (32:23)",
                 "Page app/[slug]/page.tsx (15:11)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "ParamsReadingComponent rsc:/Server/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (85:25)",
               "Page rsc:/Prerender/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (30:106)",
             ],
           }
          `)
        }
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/test')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
      })
    } else {
      it('should not error the build when synchronously reading params if all dynamic access is inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ /[slug] ')
        const $ = await next.render$('/test')
        expect($('[data-fallback]').length).toBe(2)
      })
    }
  })

  describe('Sync Dynamic - Without Fallback - params', () => {
    const { next, isTurbopack, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/sync-params-without-fallback',
      skipStart: !isNextDev,
      skipDeployment: true,
      buildOptions: inPrerenderDebugMode ? ['--debug-prerender'] : undefined,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      it('should show a collapsed redbox error', async () => {
        const browser = await next.browser('/test')

        if (isTurbopack) {
          await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
               "environmentLabel": "Server",
               "label": "Console Error",
               "source": "app/[slug]/page.tsx (31:23) @ ParamsReadingComponent
             > 31 |   const slug = params.slug
                  |                       ^",
               "stack": [
                 "ParamsReadingComponent app/[slug]/page.tsx (31:23)",
                 "Page app/[slug]/page.tsx (16:11)",
               ],
             }
            `)
        } else {
          await expect(browser).toDisplayCollapsedRedbox(`
           {
             "description": "Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis",
             "environmentLabel": "Server",
             "label": "Console Error",
             "source": null,
             "stack": [
               "ParamsReadingComponent rsc:/Server/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (74:25)",
               "Page rsc:/Prerender/webpack-internal:///(rsc)/app/%5Bslug%5D/page.tsx (30:106)",
             ],
           }
          `)
        }
      })

      it('should prefix a log after sync dynamic IO with "Server"', async () => {
        const browser = await next.browser('/test')
        const logs = await browser.log()

        assertLog(
          logs,
          'Server',
          'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
        )
      })
    } else {
      it('should error the build if dynamic IO happens in the root (outside a Suspense)', async () => {
        try {
          await next.build()
        } catch {
          // we expect the build to fail
        }

        const output = getPrerenderOutput(next.cliOutput, {
          isMinified: !inPrerenderDebugMode,
        })

        if (isTurbopack) {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at Reflect.get (<anonymous>)
                 at ParamsReadingComponent (turbopack:///[project]/app/[slug]/page.tsx:31:22)
               29 | async function ParamsReadingComponent({ params }) {
               30 |   await new Promise((r) => process.nextTick(r))
             > 31 |   const slug = params.slug
                  |                      ^
               32 |
               33 |   console.log(
               34 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/[slug]/page: /[slug]"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<anonymous>)
                 at d (<next-dist-dir>)
                 at e (<next-dist-dir>)
                 at f (<next-dist-dir>)
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /[slug]/page: /[slug], exiting the build."
            `)
          }
        } else {
          if (inPrerenderDebugMode) {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at Reflect.get (<anonymous>)
                 at ParamsReadingComponent (webpack:///app/[slug]/page.tsx:31:22)
               29 | async function ParamsReadingComponent({ params }) {
               30 |   await new Promise((r) => process.nextTick(r))
             > 31 |   const slug = params.slug
                  |                      ^
               32 |
               33 |   console.log(
               34 |     'This log should be prefixed with the "Server" environment, because the sync IO access above advanced the rendering out of the "Prerender" environment.'
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error

             > Export encountered errors on following paths:
             	/[slug]/page: /[slug]"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
             "Error: Route "/[slug]" used \`params.slug\`. \`params\` should be awaited before using its properties. Learn more: https://nextjs.org/docs/messages/sync-dynamic-apis
                 at a (<next-dist-dir>)
                 at b (<next-dist-dir>)
                 at c (<anonymous>)
                 at d (<next-dist-dir>)
                 at e (<next-dist-dir>)
                 at f (<next-dist-dir>)
             Error occurred prerendering page "/[slug]". Read more: https://nextjs.org/docs/messages/prerender-error
             Export encountered an error on /[slug]/page: /[slug], exiting the build."
            `)
          }
        }
      })
    }
  })
})
