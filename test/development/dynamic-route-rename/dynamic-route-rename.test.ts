import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Dynamic route rename casing', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not throw error when changing casing of dynamic route file', async () => {
    const html = await next.render('/abc')
    expect(html).toContain('hi')

    await next.renameFile('pages/[pid].js', 'pages/[PiD].js')

    await retry(async () => {
      expect(next.cliOutput).not.toContain(
        `You cannot use different slug names for the same dynamic path`
      )
    })

    await next.renameFile('pages/[PiD].js', 'pages/[pid].js')

    await retry(async () => {
      expect(next.cliOutput).not.toContain(
        `You cannot use different slug names for the same dynamic path`
      )
    })
  })
})
