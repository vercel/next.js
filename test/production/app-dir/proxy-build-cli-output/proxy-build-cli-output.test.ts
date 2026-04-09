import { nextTestSetup } from 'e2e-utils'

describe('proxy-build-cli-output', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should print proxy in the build CLI output', async () => {
    expect(next.cliOutput).toContain('ƒ Proxy (Middleware)')

    const browser = await next.browser('/foo')
    expect(await browser.elementByCss('p').text()).toBe('hello world')
  })
})
