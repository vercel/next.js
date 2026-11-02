import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const assetPrefix = '/custom-asset-prefix'

describe('webpack-public-path with assetPrefix', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { TEST_ASSET_PREFIX: assetPrefix },
  })

  it('starts from the asset prefix on the server', async () => {
    const response = await next.fetch('/api/public-path')
    expect((await response.json()).original).toBe(`${assetPrefix}/_next/`)
    const edgeResponse = await next.fetch('/api/edge-public-path')
    expect(await edgeResponse.json()).toEqual({
      publicPath: `${assetPrefix}/_next/`,
    })
  })

  it('rebases prefixed route chunk URLs onto the assigned path', async () => {
    let assigned = false
    const errors: string[] = []
    const responses: { pathname: string; status: number }[] = []
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        await page.route(
          `**${assetPrefix}/_next/static/chunks/**`,
          async (route) => {
            if (assigned && route.request().resourceType() === 'script') {
              await route.abort()
            } else {
              await route.continue()
            }
          }
        )
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('response', (response) => {
          responses.push({
            pathname: new URL(response.url()).pathname,
            status: response.status(),
          })
        })
      },
    })
    await browser.elementByCss('#change-public-path').click()
    await retry(async () => {
      const result = JSON.parse(
        await browser.elementByCss('#public-path-result').text()
      )
      expect(result.original).toBe(`${assetPrefix}/_next/`)
      expect(result.second.publicPath).toBe('/webpack-public-path-second/')
    })
    assigned = true
    await browser.elementByCss('#navigate').click()
    await retry(async () => {
      expect(await browser.elementByCss('#destination').text()).toBe(
        '/webpack-public-path-second/'
      )
    })
    expect(errors).toEqual([])
    for (const base of [
      '/webpack-public-path-first/',
      '/webpack-public-path-second/',
    ]) {
      expect(
        responses.some(
          (r) =>
            r.pathname.startsWith(base) &&
            r.pathname.endsWith('.js') &&
            r.status === 200
        )
      ).toBe(true)
    }
  })
})
