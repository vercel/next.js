import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('next-config-ts-no-default-export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should throw when no default export on next.config.ts', async () => {
    await expect(next.start()).rejects.toThrow(
      'next build failed with code/signal 1'
    )
    expect(stripAnsi(next.cliOutput)).toInclude(
      'next.config.ts has no default export.'
    )
  })
})
