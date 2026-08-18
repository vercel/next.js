import { nextTestSetup } from 'e2e-utils'

describe('import.meta.glob matching a stylesheet', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (!isTurbopack) {
    it('is turbopack-only', () => {})
    return
  }

  it('should name the stylesheet in the build error', async () => {
    const { cliOutput, exitCode } = await next.build()

    expect(exitCode).not.toBe(0)
    // The offending file, not just the page that globbed it.
    expect(cliOutput).toContain('styles.css')
    // The page is listed once in the import trace, not twice.
    expect(
      cliOutput.match(/app\/x-css\/page\.tsx/g)?.length
    ).toBeLessThanOrEqual(2)
  })
})
