import { nextTestSetup } from 'e2e-utils'

describe('Auto Export query error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should show warning for query provided for auto exported page correctly', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(1)
    expect(cliOutput).toContain(
      'Error: you provided query values for / which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add `getInitialProps`'
    )
    expect(cliOutput).not.toContain('Error: you provided query values for /ssr')
    expect(cliOutput).not.toContain('Error: you provided query values for /ssg')
  })
})
