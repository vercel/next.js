import { nextTestSetup, isNextDev } from 'e2e-utils'
import { retry } from 'next-test-utils'

// R33 — A custom Node server owns this listener; deployed Next.js applications cannot
// run this custom entry point.
// @force-gate !deploy
describe('documented filesystem routing opt-out', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    env: {
      NODE_ENV: isNextDev ? 'development' : 'production',
      ROUTING_TEST_WEBPACK: process.env.IS_WEBPACK_TEST ? 'true' : 'false',
    },
  })

  it.each(['/', '/secret'])(
    'does not expose the filename route %s over HTTP',
    async (path) => {
      const response = await next.fetch(path)
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('custom server destination')
    }
  )

  it('renders a custom destination with its original query and working client assets', async () => {
    const browser = await next.browser(
      '/mapped?source=custom-server&value=one&value=two'
    )
    try {
      expect(await browser.elementById('destination').text()).toBe(
        'custom server destination'
      )
      expect(JSON.parse(await browser.elementById('query').text())).toEqual({
        source: 'custom-server',
        value: ['one', 'two'],
      })
      await browser.elementById('counter').click()
      await retry(async () => {
        expect(await browser.elementById('counter').text()).toBe('1')
      })
    } finally {
      await browser.close()
    }
  })

  it('continues to serve public files', async () => {
    const response = await next.fetch('/hello.txt')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('public asset remains routable\n')
  })
})
