import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('ENOENT during require', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show ENOENT error correctly', async () => {
    await next.fetch('/')

    await check(() => {
      expect(next.cliOutput).toContain(
        "ENOENT: no such file or directory, open 'does-not-exist.txt'"
      )
      return 'yes'
    }, 'yes')
  })
})
