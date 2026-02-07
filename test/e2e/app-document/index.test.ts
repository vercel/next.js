import { nextTestSetup } from 'e2e-utils'

describe('Document and App', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have any missing key warnings', async () => {
    await next.fetch('/')
    expect(next.cliOutput).not.toContain(
      'Each child in a list should have a unique "key" prop'
    )
  })
})
