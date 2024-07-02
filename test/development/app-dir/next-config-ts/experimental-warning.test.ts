import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('next-config-ts - experimental-warning', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should warn if experimental.nextConfigTs is set to false', async () => {
    await check(
      async () => next.cliOutput,
      /is currently an experimental feature, use with caution/i
    )
  })
})
