import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Middleware overriding a Node.js API', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not show a warning and allows overriding', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)

    await retry(async () => {
      expect(next.cliOutput).toContain('fixed-value')
    })

    expect(next.cliOutput).not.toContain('TypeError')
    expect(next.cliOutput).not.toContain('A Node.js API is used (process.env')
    expect(next.cliOutput).not.toContain('A Node.js API is used (process.cwd')
  })
})
