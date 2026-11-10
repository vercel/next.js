import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Image with middleware in edge func', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not error', async () => {
    await next.browser('/')
    await retry(async () => {
      expect(next.cliOutput).toContain('GET /')
    })
    expect(next.cliOutput).not.toContain(
      `'preload' is not exported from 'react-dom'`
    )
  })
})
