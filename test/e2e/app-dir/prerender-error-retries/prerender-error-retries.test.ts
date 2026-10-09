import { nextTestSetup } from 'e2e-utils'

function countOccurrences(output: string, needle: string): number {
  return output.split(needle).length - 1
}

// This suite asserts production build CLI output, which deploy mode does not expose.
// @force-gate !deploy
describe('prerender-error-retries', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (isNextDev) {
    // The static generation retry loop only exists in `next build`.
    it('is a production build only test', () => {})
    return
  }

  it('retries deterministic blocking-prerender-client-hook errors for every configured attempt', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(exitCode).toBe(1)

    // Both prerendered paths fail with the same deterministic prerender
    // validation error, which cannot succeed on a later attempt.
    expect(cliOutput).toContain(
      'Next.js encountered URL data `useSearchParams()` in a Client Component outside of `<Suspense>`'
    )
    expect(cliOutput).toContain('Export encountered errors on 2 paths')

    // Observed (incorrect) behavior: each affected path is prerendered
    // `experimental.staticGenerationRetryCount` (3) times and the identical
    // error is reported once per attempt. A deterministic validation error
    // should only be reported once per path, so these expectations are
    // expected to become `1` when the retry loop stops retrying errors that
    // cannot change between attempts.
    expect(
      countOccurrences(
        cliOutput,
        'Error occurred prerendering page "/blog/a". Read more'
      )
    ).toBe(3)
    expect(
      countOccurrences(
        cliOutput,
        'Error occurred prerendering page "/blog/b". Read more'
      )
    ).toBe(3)

    expect(cliOutput).toContain(
      'Failed to build /blog/[slug]/page: /blog/a (attempt 1 of 3). Retrying again shortly.'
    )
    expect(cliOutput).toContain(
      'Failed to build /blog/[slug]/page: /blog/a after 3 attempts.'
    )
  }, 240_000)
})
