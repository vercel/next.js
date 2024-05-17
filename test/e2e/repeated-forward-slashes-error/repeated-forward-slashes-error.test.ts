import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('repeated-forward-slashes-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should log error when href has repeated forward-slashes', async () => {
    await next.render$('/my/path/name')
    await retry(async () => {
      expect(await next.cliOutput).toMatch(/Invalid href/)
    })
    expect(next.cliOutput).toContain(
      "Invalid href '/hello//world' passed to next/router in page: '/my/path/[name]'. Repeated forward-slashes (//) or backslashes \\ are not valid in the href."
    )
  })
})
