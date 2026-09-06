import { isNextDev, nextTestSetup } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'

export interface CacheComponentsErrorsContext {
  next: NextInstance
  isTurbopack: boolean
  isRspack: boolean
  isNextStart: boolean
  isDebugPrerender: boolean
  prerender: (pathname: string) => Promise<void>
  // Always false when sections run (the wrapper returns early when skipped);
  // exposed because some sections carry redundant guards.
  skipped: boolean
}

// This suite is far too slow to run as a single CI test file, so it's split
// into one `*.test.ts` entry file per group of sections (each with a
// `.partial-prefetching` variant), all sharing this wrapper. Each entry
// boots its own server (and, in `next start` mode, runs its own builds).
// Snapshots can be updated with the sibling update-snapshots.sh script.
export function runCacheComponentsErrorsTests(
  registerTests: (ctx: CacheComponentsErrorsContext) => void
) {
  describe('Cache Components Errors', () => {
    const { next, isTurbopack, isNextStart, skipped, isRspack } = nextTestSetup(
      {
        files: __dirname + '/fixtures/default',
        skipStart: !isNextDev,
        skipDeployment: true,
      }
    )

    if (skipped) {
      return
    }

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
      // The snapshots can't be created for both modes at the same time because of
      // an issue in the typescript plugin for prettier. Defining
      // NEXT_TEST_DEBUG_PRERENDER allows us to run them sequentially, when we
      // need to update the snapshots.
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
          `app${pathname}/page.tsx`,
        ]

        if (isDebugPrerender) {
          args.push('--debug-prerender')
        }

        await next.build({ args })
      }

      registerTests({
        next,
        isTurbopack,
        isRspack,
        isNextStart,
        isDebugPrerender,
        prerender,
        skipped,
      })
    })
  })
}
