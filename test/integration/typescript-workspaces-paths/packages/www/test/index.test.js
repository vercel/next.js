/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

async function get$(path, query) {
  const html = await renderViaHTTP(appPort, path, query)
  return cheerio.load(html)
}

describe('TypeScript Features', () => {
  describe('default behavior', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {})
    })
    afterAll(() => killApp(app))

    it('should alias components', async () => {
      const $ = await get$('/basic-alias')
      expect($('body').text()).toMatch(/World/)
    })

    it('should resolve the first item in the array first', async () => {
      const $ = await get$('/resolve-order')
      expect($('body').text()).toMatch(/Hello from a/)
    })

    it('should resolve the second item in as a fallback', async () => {
      const $ = await get$('/resolve-fallback')
      expect($('body').text()).toMatch(/Hello from only b/)
    })

    it('should resolve a single matching alias', async () => {
      const $ = await get$('/single-alias')
      expect($('body').text()).toMatch(/Hello/)
    })

    it('should not resolve to .d.ts files', async () => {
      const $ = await get$('/alias-to-d-ts')
      expect($('body').text()).toMatch(/Not aliased to d\.ts file/)
    })
  })
})
