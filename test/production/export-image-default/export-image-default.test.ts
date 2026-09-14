import { nextTestSetup } from 'e2e-utils'

describe('Export with default loader next/image component', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error during next build', async () => {
    const { exitCode } = await next.build()
    expect(next.cliOutput).toContain(
      'Image Optimization using the default loader is not compatible with export.'
    )
    expect(exitCode).toBe(1)
  })
})
