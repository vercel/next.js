import { nextTestSetup } from 'e2e-utils'

// This suite asserts output of a local production build, which dev mode never
// runs and deploy mode does not expose.
// @force-gate prod
// @force-gate !deploy
describe('cache-components - client hook rejection without async context', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      // Emulates Bun's JS runtime, which drops the AsyncLocalStorage context
      // in `unhandledRejection` listeners. See the file for details.
      NODE_OPTIONS: '--require ./emulate-bun-async-context.js',
    },
  })

  // Current (incorrect) behavior, reported for `bun --bun next build`: the
  // hanging promise that backs `useSearchParams()` rejects when the prerender
  // is aborted, and because the unhandled rejection filter cannot read the
  // work unit store it logs the rejection, claiming the hook was used outside
  // of `<Suspense>` even though the page wraps it in one. Once the rejection
  // is handled (or the filter stops depending on the async context being
  // propagated into the listener), this expectation has to be flipped to
  // `not.toContain`.
  it('logs a blocking-prerender-client-hook error for a Suspense-wrapped useSearchParams()', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(exitCode).toBe(0)
    expect(cliOutput).toContain(
      'Next.js encountered URL data `useSearchParams()` in a Client Component outside of `<Suspense>`'
    )
    expect(cliOutput).toContain("digest: 'CLIENT_HOOK_DYNAMIC'")

    // The Suspense boundary did its job: the route is prerendered as a static
    // shell without the search param content, so the logged error is spurious.
    const html = await next.readFile(`${next.distDir}/server/app/index.html`)
    expect(html).toContain('static shell')
    expect(html).not.toContain('search param:')
  })
})
