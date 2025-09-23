import { nextTestSetup } from 'e2e-utils'

describe('proxy-with-middleware', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should error when both middleware and proxy files are detected', async () => {
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain(
      'Both "middleware" and "proxy" files are detected. Please use "proxy" instead.'
    )
  })
})
