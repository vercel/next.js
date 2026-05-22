import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getPrerenderOutput } from './utils'

describe('Cache Components HTTP Access Fallback Prerender', () => {
  const { next, isTurbopack, isNextStart, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/http-access-fallback-prerender',
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  let cliOutputLength: number

  beforeEach(() => {
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
        name: 'Build With --debug-prerender',
      })
    }
    if (!prerenderMode || prerenderMode === 'false') {
      testCases.push({
        isDebugPrerender: false,
        name: 'Build Without --debug-prerender',
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
        `app${pathname}/page.tsx`,
      ]

      if (isDebugPrerender) {
        args.push('--debug-prerender')
      }

      await next.build({ args })
    }

    const buildPath = async (pathname: string) => {
      const args = ['--debug-build-paths', `app${pathname}/page.tsx`]

      if (isDebugPrerender) {
        args.push('--debug-prerender')
      }

      await next.build({ args })
    }

    const expectStaticRouteArtifacts = async (route: string) => {
      const meta = JSON.parse(
        await next.readFile(`.next/server/app/${route}.meta`)
      )

      expect(await next.readFile(`.next/server/app/${route}.html`)).toEqual(
        expect.any(String)
      )
      expect(meta.status).toBe(404)
      expect(meta.segmentPaths).toContain('/_tree')
      expect(
        await next.readFile(
          `.next/server/app/${route}.segments/_tree.segment.rsc`
        )
      ).toEqual(expect.any(String))
    }

    describe('notFound()', () => {
      const pagePath = '/not-found/[slug]'
      const visitUrl = '/not-found/not-found'

      if (isNextDev) {
        it('should show a collapsed redbox when not-found.tsx uses useSearchParams without Suspense', async () => {
          const browser = await next.browser(visitUrl)

          await expect(browser).toDisplayCollapsedRedbox(
            `"Redbox did not open."`
          )
        })
      } else {
        it('should log the fallback dynamic error without failing the build', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/not-found/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at NotFound (app/not-found/[slug]/not-found.tsx:6:39)
                 4 |
                 5 | export default function NotFound() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>not found {searchParams.get('foo')}</p>
                 9 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/not-found/[slug]" in your browser to investigate the error."
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/not-found/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at <unknown> (app/not-found/[slug]/not-found.tsx:6:24)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 4 |
                 5 | export default function NotFound() {
               > 6 |   const searchParams = useSearchParams()
                   |                        ^
                 7 |
                 8 |   return <p>not found {searchParams.get('foo')}</p>
                 9 | }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/not-found/[slug]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/not-found/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at NotFound (webpack:///app/not-found/[slug]/not-found.tsx:6:39)
                 4 |
                 5 | export default function NotFound() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>not found {searchParams.get('foo')}</p>
                 9 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/not-found/[slug]" in your browser to investigate the error."
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/not-found/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at h (<next-dist-dir>)
                   at i (<next-dist-dir>)
                   at j (<next-dist-dir>)
                   at k (<next-dist-dir>)
                   at l (<next-dist-dir>)
                   at m (<next-dist-dir>)
                   at n (<next-dist-dir>)
                   at o (<next-dist-dir>)
                   at p (<next-dist-dir>)
                   at q (<next-dist-dir>)
                   at r (<next-dist-dir>)
                   at s (<next-dist-dir>)
                   at t (<next-dist-dir>)
                   at u (<next-dist-dir>)
                   at v (<next-dist-dir>)
                   at w (<next-dist-dir>)
                   at x (<next-dist-dir>)
                   at y (<next-dist-dir>)
                   at z (<next-dist-dir>)
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/not-found/[slug]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces."
              `)
            }
          }
        })
      }
    })

    describe('forbidden()', () => {
      const pagePath = '/forbidden/[slug]'
      const visitUrl = '/forbidden/forbidden'

      if (isNextDev) {
        it('should show a collapsed redbox when forbidden.tsx uses useSearchParams without Suspense', async () => {
          const browser = await next.browser(visitUrl)

          await expect(browser).toDisplayCollapsedRedbox(
            `"Redbox did not open."`
          )
        })
      } else {
        it('should log the fallback dynamic error without failing the build', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/forbidden/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at Forbidden (app/forbidden/[slug]/forbidden.tsx:6:39)
                 4 |
                 5 | export default function Forbidden() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>forbidden {searchParams.get('foo')}</p>
                 9 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/forbidden/[slug]" in your browser to investigate the error."
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/forbidden/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at <unknown> (app/forbidden/[slug]/forbidden.tsx:6:24)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 4 |
                 5 | export default function Forbidden() {
               > 6 |   const searchParams = useSearchParams()
                   |                        ^
                 7 |
                 8 |   return <p>forbidden {searchParams.get('foo')}</p>
                 9 | }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/forbidden/[slug]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/forbidden/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at Forbidden (webpack:///app/forbidden/[slug]/forbidden.tsx:6:39)
                 4 |
                 5 | export default function Forbidden() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>forbidden {searchParams.get('foo')}</p>
                 9 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/forbidden/[slug]" in your browser to investigate the error."
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/forbidden/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at h (<next-dist-dir>)
                   at i (<next-dist-dir>)
                   at j (<next-dist-dir>)
                   at k (<next-dist-dir>)
                   at l (<next-dist-dir>)
                   at m (<next-dist-dir>)
                   at n (<next-dist-dir>)
                   at o (<next-dist-dir>)
                   at p (<next-dist-dir>)
                   at q (<next-dist-dir>)
                   at r (<next-dist-dir>)
                   at s (<next-dist-dir>)
                   at t (<next-dist-dir>)
                   at u (<next-dist-dir>)
                   at v (<next-dist-dir>)
                   at w (<next-dist-dir>)
                   at x (<next-dist-dir>)
                   at y (<next-dist-dir>)
                   at z (<next-dist-dir>)
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/forbidden/[slug]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces."
              `)
            }
          }
        })
      }
    })

    describe('unauthorized()', () => {
      const pagePath = '/unauthorized/[slug]'
      const visitUrl = '/unauthorized/unauthorized'

      if (isNextDev) {
        it('should show a collapsed redbox when unauthorized.tsx uses useSearchParams without Suspense', async () => {
          const browser = await next.browser(visitUrl)

          await expect(browser).toDisplayCollapsedRedbox(
            `"Redbox did not open."`
          )
        })
      } else {
        it('should log the fallback dynamic error without failing the build', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          if (isTurbopack) {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/unauthorized/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at Unauthorized (app/unauthorized/[slug]/unauthorized.tsx:6:39)
                 4 |
                 5 | export default function Unauthorized() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>unauthorized {searchParams.get('foo')}</p>
                 9 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/unauthorized/[slug]" in your browser to investigate the error."
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/unauthorized/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at <unknown> (app/unauthorized/[slug]/unauthorized.tsx:6:24)
                   at body (<anonymous>)
                   at html (<anonymous>)
                 4 |
                 5 | export default function Unauthorized() {
               > 6 |   const searchParams = useSearchParams()
                   |                        ^
                 7 |
                 8 |   return <p>unauthorized {searchParams.get('foo')}</p>
                 9 | }
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/unauthorized/[slug]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces."
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/unauthorized/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at Unauthorized (webpack:///app/unauthorized/[slug]/unauthorized.tsx:6:39)
                 4 |
                 5 | export default function Unauthorized() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>unauthorized {searchParams.get('foo')}</p>
                 9 | }
               To debug the issue, start the app in development mode by running \`next dev\`, then open "/unauthorized/[slug]" in your browser to investigate the error."
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Route "/unauthorized/[slug]": Next.js encountered uncached or runtime data during prerendering.

               \`fetch(...)\`, \`cookies()\`, \`headers()\`, \`params\`, \`searchParams\`, or \`connection()\` accessed outside of \`<Suspense>\` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.

               Ways to fix this:
                 - Cache the data access with \`"use cache"\`
                 - Provide a placeholder with \`<Suspense fallback={...}>\` around the data access
                 - If the runtime data is \`params\` and they're known, prerender them with \`generateStaticParams\`
                 - Set \`export const instant = false\` to allow a blocking route

               Learn more: https://nextjs.org/docs/messages/blocking-route
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at h (<next-dist-dir>)
                   at i (<next-dist-dir>)
                   at j (<next-dist-dir>)
                   at k (<next-dist-dir>)
                   at l (<next-dist-dir>)
                   at m (<next-dist-dir>)
                   at n (<next-dist-dir>)
                   at o (<next-dist-dir>)
                   at p (<next-dist-dir>)
                   at q (<next-dist-dir>)
                   at r (<next-dist-dir>)
                   at s (<next-dist-dir>)
                   at t (<next-dist-dir>)
                   at u (<next-dist-dir>)
                   at v (<next-dist-dir>)
                   at w (<next-dist-dir>)
                   at x (<next-dist-dir>)
                   at y (<next-dist-dir>)
                   at z (<next-dist-dir>)
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>)
                   at d (<next-dist-dir>)
                   at e (<next-dist-dir>)
                   at f (<next-dist-dir>)
                   at g (<next-dist-dir>)
                   at body (<anonymous>)
                   at html (<anonymous>)
               To get a more detailed stack trace and pinpoint the issue, try one of the following:
                 - Start the app in development mode by running \`next dev\`, then open "/unauthorized/[slug]" in your browser to investigate the error.
                 - Rerun the production build with \`next build --debug-prerender\` to generate better stack traces."
              `)
            }
          }
        })
      }
    })

    describe('notFound() above the matching not-found boundary', () => {
      if (!isNextDev) {
        it('should emit static artifacts', async () => {
          await buildPath('/not-found-above-boundary/child')
          await expectStaticRouteArtifacts('not-found-above-boundary/child')
        })
      }
    })
  })
})
