import { nextTestSetup } from 'e2e-utils'

describe.each([
  { browserMaps: false, serverMaps: 'default' },
  { browserMaps: true, serverMaps: 'true' },
  { browserMaps: true, serverMaps: 'false' },
  { browserMaps: false, serverMaps: 'false' },
])(
  'shared emitted maps: browser=$browserMaps server=$serverMaps',
  ({ browserMaps, serverMaps }) => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      env: {
        TEST_BROWSER_SOURCE_MAPS: String(browserMaps),
        TEST_SERVER_SOURCE_MAPS: serverMaps,
      },
    })

    it('uses destination source-map settings without browser/SSR output conflicts', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('#mapped-value').text()).toBe(
        'mapped-value'
      )
      const edge = await next.fetch('/edge')
      expect(edge.status).toBe(200)
      expect(await edge.json()).toEqual({ mapped: 'mapped-value' })
      const asset = await next.fetch(
        '/_next/static/media/shared.js' + next.getAssetQuery()
      )
      expect(asset.status).toBe(200)
      const content = await asset.text()
      const map = await next.fetch(
        '/_next/static/media/shared.js.map' + next.getAssetQuery()
      )
      if (isNextDev || browserMaps) {
        expect(content).toContain('sourceMappingURL=shared.js.map')
        expect(map.status).toBe(200)
        const sourceMap = await map.json()
        expect(sourceMap.file.split('/').pop()).toBe('shared.js')
        expect(sourceMap.sourcesContent).toEqual(['original'])
      } else {
        expect(content).not.toContain('sourceMappingURL=')
        expect(map.status).toBe(404)
      }
    })
  }
)
