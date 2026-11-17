import { nextTestSetup } from 'e2e-utils'

describe('Export index page with `notFound: true` in `getStaticProps`', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: {
      NEXT_STATIC_GENERATION_PROFILE: '1',
    },
  })

  it('should build successfully', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const summary = JSON.parse(
      await next.readFile('.next/diagnostics/static-generation-summary.json')
    )
    expect(summary.pages).toBeGreaterThan(0)
    // The export pass skips this getStaticProps page. Its undefined result
    // must not replace the successful prerender's profile with a failed page.
    expect(summary.failedPages).toBe(0)
  })
})
