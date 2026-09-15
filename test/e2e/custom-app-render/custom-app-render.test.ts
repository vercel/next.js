import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('custom-app-render', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /Next mode: (production|development)/,
    dependencies: {
      'get-port': '5.1.1',
    },
  })

  it.each(['/', '/render'])('should render %s', async (page) => {
    const $ = await next.render$(page)
    expect($('#page').data('page')).toBe(page)
  })

  it('should warn when using the deprecated render method', async () => {
    await next.render('/render')
    await retry(async () => {
      expect(next.cliOutput).toContain(
        'The `app.render()` method is deprecated in custom servers.'
      )
    })
  })
})
