import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('disable-logging-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not log if disabled logging', async () => {
    const html = await next.render('/slug1')
    expect(html).toContain('slug1')
    expect(next.cliOutput).not.toContain('GET /slug1')

    // re-enable logging
    await next.patchFile('next.config.js', (content) =>
      content.replace('logging: false,', '')
    )

    // should log now
    await check(async () => {
      const html = await next.render('/slug1')
      expect(html).toContain('slug1')
      expect(next.cliOutput).toContain('GET /slug1')
      return 'success'
    }, 'success')
  })
})
