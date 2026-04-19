import { nextTestSetup } from 'e2e-utils'

describe('app-dir - disable-logging-route', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not log if disabled logging', async () => {
    const html = await next.render('/slug1')
    expect(html).toContain('slug1')
    expect(next.cliOutput).not.toContain('Compiling')
    expect(next.cliOutput).not.toContain('GET')
  })
})
