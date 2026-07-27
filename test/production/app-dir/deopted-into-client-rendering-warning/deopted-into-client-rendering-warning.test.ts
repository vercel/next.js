import { nextTestSetup } from 'e2e-utils'

describe('deopted-into-client-rendering-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should not show deopted into client rendering warning', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toContain(
      `Entire page / deopted into client-side rendering.`
    )
  })
})
