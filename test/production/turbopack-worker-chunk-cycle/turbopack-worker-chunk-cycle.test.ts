import { nextTestSetup } from 'e2e-utils'

// Only Turbopack production builds derive chunk file names from a hash of the
// chunk's own content, which is what closes the cycle. webpack/rspack builds
// of the same app succeed.
const isTurbopackBuild =
  !process.env.IS_WEBPACK_TEST && !process.env.NEXT_RSPACK

// A deadlocked build prints nothing and burns no CPU, so cap it below the Jest
// timeout to fail with a useful message instead of a bare timeout.
const BUILD_TIMEOUT_MS = 180_000

const describeTurbopack = isTurbopackBuild ? describe : describe.skip

describeTurbopack('turbopack-worker-chunk-cycle', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  // The worker chunk group for `modules/w1.js` references its own chunks
  // because the worker spawns itself, and worker chunk groups are created with
  // `AvailabilityInfo::root()`, so the self reference is never unrolled the way
  // a mutual `import()` would be. In a production client build the chunk path
  // is a hash of the chunk content, so chunk content -> referenced chunk path
  // -> chunk content forms an await cycle in turbo-tasks, which has no cycle
  // detection: the build parks forever at "Creating an optimized production
  // build ..." at 0% CPU instead of finishing or erroring.
  it(
    'builds an app with a worker that spawns itself',
    async () => {
      const result = await Promise.race([
        next.build(),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), BUILD_TIMEOUT_MS)
        ),
      ])

      if (result === 'timeout') {
        throw new Error(
          `next build did not finish within ${BUILD_TIMEOUT_MS}ms; it deadlocked while chunking the self-spawning worker`
        )
      }

      expect(result.cliOutput).not.toContain('Failed to compile')
      expect(result.exitCode).toBe(0)
    },
    BUILD_TIMEOUT_MS + 60_000
  )
})
