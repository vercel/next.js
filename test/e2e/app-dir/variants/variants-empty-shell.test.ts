import { isNextDev, nextTestSetup } from 'e2e-utils'

describe('variants with a variant read above every boundary', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/empty-shell',
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    // Dev declares no combinations, so it does not produce the prerender this
    // is about. Covered by a dev overlay instead, once dev declares them.
    it.skip('reports the empty prerender', () => {})
    return
  }

  it('should fail the build', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain(
      'Error occurred prerendering page "/above-boundary"'
    )
  })
})
