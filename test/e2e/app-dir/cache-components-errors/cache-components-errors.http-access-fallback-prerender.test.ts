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
               "Error: Bail out to client-side rendering: useSearchParams()
                   at NotFound (app/not-found/[slug]/not-found.tsx:6:39)
                 4 |
                 5 | export default function NotFound() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>not found {searchParams.get('foo')}</p>
                 9 | } {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at <unknown> (app/not-found/[slug]/not-found.tsx:6:24)
                 4 |
                 5 | export default function NotFound() {
               > 6 |   const searchParams = useSearchParams()
                   |                        ^
                 7 |
                 8 |   return <p>not found {searchParams.get('foo')}</p>
                 9 | } {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at useDynamicSearchParams (webpack:///<next-src>)
                   at useSearchParams (webpack:///<next-src>)
                   at NotFound (webpack:///app/not-found/[slug]/not-found.tsx:6:39)
                 707 |         return
                 708 |       }
               > 709 |       throw new BailoutToCSRError(expression)
                     |             ^
                 710 |     }
                 711 |     case 'prerender':
                 712 |     case 'prerender-runtime': {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>) {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
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
               "Error: Bail out to client-side rendering: useSearchParams()
                   at Forbidden (app/forbidden/[slug]/forbidden.tsx:6:39)
                 4 |
                 5 | export default function Forbidden() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>forbidden {searchParams.get('foo')}</p>
                 9 | } {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at <unknown> (app/forbidden/[slug]/forbidden.tsx:6:24)
                 4 |
                 5 | export default function Forbidden() {
               > 6 |   const searchParams = useSearchParams()
                   |                        ^
                 7 |
                 8 |   return <p>forbidden {searchParams.get('foo')}</p>
                 9 | } {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at useDynamicSearchParams (webpack:///<next-src>)
                   at useSearchParams (webpack:///<next-src>)
                   at Forbidden (webpack:///app/forbidden/[slug]/forbidden.tsx:6:39)
                 707 |         return
                 708 |       }
               > 709 |       throw new BailoutToCSRError(expression)
                     |             ^
                 710 |     }
                 711 |     case 'prerender':
                 712 |     case 'prerender-runtime': {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>) {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
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
               "Error: Bail out to client-side rendering: useSearchParams()
                   at Unauthorized (app/unauthorized/[slug]/unauthorized.tsx:6:39)
                 4 |
                 5 | export default function Unauthorized() {
               > 6 |   const searchParams = useSearchParams()
                   |                                       ^
                 7 |
                 8 |   return <p>unauthorized {searchParams.get('foo')}</p>
                 9 | } {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at <unknown> (app/unauthorized/[slug]/unauthorized.tsx:6:24)
                 4 |
                 5 | export default function Unauthorized() {
               > 6 |   const searchParams = useSearchParams()
                   |                        ^
                 7 |
                 8 |   return <p>unauthorized {searchParams.get('foo')}</p>
                 9 | } {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            }
          } else {
            if (isDebugPrerender) {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at useDynamicSearchParams (webpack:///<next-src>)
                   at useSearchParams (webpack:///<next-src>)
                   at Unauthorized (webpack:///app/unauthorized/[slug]/unauthorized.tsx:6:39)
                 707 |         return
                 708 |       }
               > 709 |       throw new BailoutToCSRError(expression)
                     |             ^
                 710 |     }
                 711 |     case 'prerender':
                 712 |     case 'prerender-runtime': {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
              `)
            } else {
              expect(output).toMatchInlineSnapshot(`
               "Error: Bail out to client-side rendering: useSearchParams()
                   at a (<next-dist-dir>)
                   at b (<next-dist-dir>)
                   at c (<next-dist-dir>) {
                 reason: 'useSearchParams()',
                 digest: 'BAILOUT_TO_CLIENT_SIDE_RENDERING'
               }"
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
