import { nextTestSetup } from 'e2e-utils'

describe('Export error for fallback: true', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should build successfully', async () => {
    const { exitCode } = await next.build()

    expect(next.cliOutput).toContain('Found pages with `fallback` enabled')
    expect(next.cliOutput).toContain(
      'Pages with `fallback` enabled in `getStaticPaths` can not be exported'
    )
    expect(next.cliOutput).toContain('/[slug]')
    expect(exitCode).toBe(1)
  })
})
