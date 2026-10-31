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

  it.each([
    ['fixed', 'static catalog', {}],
    ['one', 'dynamic catalog', { id: 'one' }],
    ['one/two', 'catch-all catalog', { slug: ['one', 'two'] }],
  ])(
    'agrees on route priority and repeated query values for direct/outer %s',
    async (pathname, marker, params) => {
      for (const [prefix, host] of [
        ['/mapped-catalog/', 'outer-router'],
        [
          '/direct/catalog/',
          isNextDev ? 'custom-render-forwarding' : 'inner-render',
        ],
      ]) {
        const response = await next.fetch(
          prefix + pathname + '?value=one&value=two'
        )
        expect({ host, status: response.status }).toEqual({ host, status: 200 })
        expect(response.headers.get('x-routing-host')).toBe(host)
        const $ = await next.render$(prefix + pathname + '?value=one&value=two')
        expect(JSON.parse($('#catalog').text())).toEqual({
          marker,
          query: { value: ['one', 'two'], ...params },
        })
      }
    }
  )

  // Route mutation belongs only to the dev generation contract.
  // @force-gate dev
  it('refreshes direct and outer lookups after a route generation changes', async () => {
    const filename = 'pages/catalog/fixed.tsx'
    const original = await next.readFile(filename)
    async function expectBoth(marker: string) {
      await retry(async () => {
        for (const prefix of ['/mapped-catalog/', '/direct/catalog/']) {
          const $ = await next.render$(prefix + 'fixed')
          expect(JSON.parse($('#catalog').text()).marker).toBe(marker)
        }
      })
    }
    try {
      await expectBoth('static catalog')
      await next.patchFile(
        filename,
        original.replace('static catalog', 'updated static catalog')
      )
      await expectBoth('updated static catalog')
      await next.deleteFile(filename)
      await expectBoth('dynamic catalog')
    } finally {
      await next.patchFile(filename, original)
    }
    await expectBoth('static catalog')
  })
})
