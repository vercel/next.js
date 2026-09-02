import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - metadata dynamic routes suspense', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render metadata in head when root layout is wrapped with Suspense for bot requests', async () => {
    const $ = await next.render$('/', undefined, {
      headers: {
        'User-Agent': 'Discordbot/2.0;',
      },
    })
    expect($('head title').text()).toBe('My title')
    expect($('head meta[name="application-name"]').attr('content')).toBe(
      'suspense-app'
    )

    // unique title
    expect($('title').length).toBe(1)
  })
})
