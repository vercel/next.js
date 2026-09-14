import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { NextInstanceOpts } from '../../lib/next-modes/base'

describe('React Profiling Mode', () => {
  describe('default is disabled', () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should not have used the react-dom profiling bundle', async () => {
      const browser = await next.browser('/')
      const results = await browser.eval('window.profileResults')

      expect(results).toBeFalsy()
    })
  })

  describe.each([
    {
      name: 'config setting',
      opts: {
        env: { TEST_REACT_PRODUCTION_PROFILING: 'true' },
      } satisfies Partial<NextInstanceOpts>,
    },
    {
      name: 'CLI flag',
      opts: { buildArgs: ['--profile'] } satisfies Partial<NextInstanceOpts>,
    },
  ])('enabled with $name', ({ opts }) => {
    const { next } = nextTestSetup({
      files: __dirname,
      ...opts,
    })

    it('should have used the react-dom profiling bundle for pages', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        const results = await browser.eval('window.profileResults')

        expect(results.length).toBe(1)
        expect(results[0] && results[0][0]).toBe('hello')
      })
    })

    it('should have used the react-dom profiling bundle for client component', async () => {
      const browser = await next.browser('/client')
      await retry(async () => {
        const results = await browser.eval('window.profileResults')

        expect(results.length).toBe(1)
        expect(results[0] && results[0][0]).toBe('hello-app-client')
      })
    })

    it('should have used the react-dom profiling bundle for server component', async () => {
      // Can't test react Profiler API in server components but make sure rendering works
      const browser = await next.browser('/server')

      expect(await browser.waitForElementByCss('p').text()).toBe(
        'hello app server'
      )
    })
  })
})
