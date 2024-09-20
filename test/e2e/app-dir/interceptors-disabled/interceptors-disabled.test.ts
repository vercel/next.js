import { nextTestSetup } from 'e2e-utils'

describe('interceptors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('with experimental.interceptors not set to true', () => {
    it('should not intercept requests', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      expect(next.cliOutput).not.toInclude('interceptor called!')
    })
  })
})
