import { isNextDev, nextTestSetup } from 'e2e-utils'
import { getPrerenderOutput } from './utils'

describe('Cache Components HTTP Access Fallback Prerender', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
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

    const expectStaticRouteArtifacts = async (route: string, status = 404) => {
      const meta = JSON.parse(
        await next.readFile(`.next/server/app/${route}.meta`)
      )

      expect(await next.readFile(`.next/server/app/${route}.html`)).toEqual(
        expect.any(String)
      )
      expect(meta.status).toBe(status)
      expect(meta.postponed).toBeUndefined()
      expect(meta.segmentPaths).toContain('/_tree')
      expect(
        await next.readFile(
          `.next/server/app/${route}.segments/_tree.segment.rsc`
        )
      ).toEqual(expect.any(String))
    }

    const expectPartiallyStaticErrorArtifacts = async (
      route: string,
      status = 404
    ) => {
      const meta = JSON.parse(
        await next.readFile(`.next/server/app/${route}.meta`)
      )

      expect(await next.readFile(`.next/server/app/${route}.html`)).toEqual(
        expect.any(String)
      )
      expect(meta.status).toBe(status)
      expect(meta.postponed).toEqual(expect.any(String))
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
        it('should skip static shell validation during fallback recovery', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`""`)
          await expectStaticRouteArtifacts('not-found/not-found')
        })
      }
    })

    describe('notFound() with root client params during recovery', () => {
      const pagePath = '/not-found-use-params/[slug]'

      if (!isNextDev) {
        it('should fall through from the resume-abort recovery and emit static artifacts', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`""`)
          await expectStaticRouteArtifacts('not-found-use-params/not-found')
        })
      }
    })

    describe('notFound() with static RSC data', () => {
      const pagePath = '/not-found-static-flight/[slug]'

      if (!isNextDev) {
        it('should preserve the original static Flight data during recovery', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`""`)
          await expectStaticRouteArtifacts('not-found-static-flight/not-found')
        })
      }
    })

    describe('notFound() with dynamic RSC data', () => {
      const pagePath = '/not-found-dynamic-flight/[slug]'

      if (!isNextDev) {
        it('should preserve the original dynamic Flight data during recovery', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`""`)
          await expectPartiallyStaticErrorArtifacts(
            'not-found-dynamic-flight/not-found'
          )
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
        it('should skip static shell validation during fallback recovery', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`""`)
          await expectStaticRouteArtifacts('forbidden/forbidden', 403)
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
        it('should skip static shell validation during fallback recovery', async () => {
          await prerender(pagePath)

          const output = getPrerenderOutput(
            next.cliOutput.slice(cliOutputLength),
            { isMinified: !isDebugPrerender }
          )

          expect(output).toMatchInlineSnapshot(`""`)
          await expectStaticRouteArtifacts('unauthorized/unauthorized', 401)
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
