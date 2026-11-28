import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('Export with default loader next/image component in app', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'default'),
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

describe('Export with unoptimized next/image component in app', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'unoptimized'),
    skipStart: true,
  })

  it('should not error during next build', async () => {
    const { exitCode } = await next.build()
    expect(next.cliOutput).not.toContain(
      'Image Optimization using the default loader is not compatible with export.'
    )
    expect(exitCode).toBe(0)
  })
})
