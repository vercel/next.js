import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { getPrerenderOutput } from './utils'

describe('Cache Components Errors - Dynamic Metadata Empty Shell', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/dynamic-metadata-empty-shell',
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let cliOutputLength: number

  beforeEach(async () => {
    cliOutputLength = next.cliOutput.length
  })

  afterEach(async () => {
    if (isNextStart) {
      await next.stop()
    }
  })

  const testCases: { isDebugPrerender: boolean; name: string }[] = []

  if (isNextDev) {
    testCases.push({ isDebugPrerender: false, name: 'Dev' })
  } else {
    const prerenderMode = process.env.NEXT_TEST_DEBUG_PRERENDER
    if (!prerenderMode || prerenderMode === 'true') {
      testCases.push({
        isDebugPrerender: true,
        name: 'Build With --prerender-debug',
      })
    }
    if (!prerenderMode || prerenderMode === 'false') {
      testCases.push({
        isDebugPrerender: false,
        name: 'Build Without --prerender-debug',
      })
    }
  }

  describe.each(testCases)('$name', ({ isDebugPrerender }) => {
    beforeAll(async () => {
      if (isNextStart) {
        const args = ['--experimental-build-mode', 'compile']

        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }

        await next.build({ args })
      }
    })

    const prerender = async (pathname: string) => {
      const args = [
        '--experimental-build-mode',
        'generate',
        '--debug-build-paths',
        // Escape square brackets for pathnames with dynamic segments.
        `app${pathname.replace(/([[\]])/g, '\\$1')}/page.tsx`,
      ]

      if (isDebugPrerender) {
        args.push('--debug-prerender')
      }

      await next.build({ args })
    }

    describe('Dynamic Metadata with connection() - Empty Shell', () => {
      const pathname = '/dynamic-metadata-connection-empty-shell'

      if (isNextDev) {
        it('should show a collapsed redbox error with dynamic metadata message', async () => {
          const browser = await next.browser(pathname)

          await retry(async () => {
            await expect(browser).toDisplayCollapsedRedbox(`
             {
               "description": "Data that blocks navigation was accessed inside generateMetadata() in an otherwise prerenderable page

             When Document metadata is the only part of a page that cannot be prerendered Next.js expects you to either make it prerenderable or make some other part of the page non-prerenderable to avoid unintentional partially dynamic pages. Uncached data such as fetch(...), cached data with a low expire time, or connection() are all examples of data that only resolve on navigation.

             To fix this:

             Move the asynchronous await into a Cache Component ("use cache"). This allows Next.js to statically prerender generateMetadata() as part of the HTML document, so it's instantly visible to the user.

             or

             add connection() inside a <Suspense> somewhere in a Page or Layout. This tells Next.js that the page is intended to have some non-prerenderable parts.

             Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata",
               "environmentLabel": "Server",
               "label": "Ambiguous Metadata",
               "source": "app/dynamic-metadata-connection-empty-shell/page.tsx (2:9) @ Module.generateMetadata
             > 2 |   await connection()
                 |         ^",
               "stack": [
                 "Module.generateMetadata app/dynamic-metadata-connection-empty-shell/page.tsx (2:9)",
               ],
             }
            `)
          })
        })
      } else {
        it('should error the build with dynamic metadata message instead of generic error', async () => {
          try {
            await prerender(pathname)
          } catch {
            // we expect the build to fail
          }

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          // Перевіряємо, що повертається конкретна помилка про dynamicMetadata,
          // а не загальна помилка "Next.js was unable to determine a reason"
          expect(output).toContain(
            'Runtime data such as `cookies()`, `headers()`, `params`, or `searchParams` was accessed inside `generateMetadata`'
          )
          expect(output).toContain(
            'https://nextjs.org/docs/messages/next-prerender-dynamic-metadata'
          )
          // Перевіряємо, що НЕ з'являється загальна помилка
          expect(output).not.toContain(
            'did not produce a static shell and Next.js was unable to determine a reason'
          )

          if (isDebugPrerender) {
            expect(output).toMatchInlineSnapshot(`
              "Route "/dynamic-metadata-connection-empty-shell": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateMetadata\` or you have file-based metadata such as icons that depend on dynamic params segments. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
              Error occurred prerendering page "/dynamic-metadata-connection-empty-shell". Read more: https://nextjs.org/docs/messages/prerender-error

              > Export encountered errors on following paths:
              	/dynamic-metadata-connection-empty-shell/page: /dynamic-metadata-connection-empty-shell"
            `)
          } else {
            expect(output).toMatchInlineSnapshot(`
              "Route "/dynamic-metadata-connection-empty-shell": Runtime data such as \`cookies()\`, \`headers()\`, \`params\`, or \`searchParams\` was accessed inside \`generateMetadata\` or you have file-based metadata such as icons that depend on dynamic params segments. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata
              Error occurred prerendering page "/dynamic-metadata-connection-empty-shell". Read more: https://nextjs.org/docs/messages/prerender-error
              Export encountered an error on /dynamic-metadata-connection-empty-shell/page: /dynamic-metadata-connection-empty-shell, exiting the build."
            `)
          }
        })
      }
    })
  })
})
