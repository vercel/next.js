/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let appPort
let app

async function get$(path, query) {
  const html = await renderViaHTTP(appPort, path, query)
  return cheerio.load(html)
}

describe('TypeScript Features', () => {
  describe('default behavior', () => {
    let output = ''

    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          output += msg || ''
        },
        onStdout(msg) {
          output += msg || ''
        },
      })
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

    it('should resolve the second item as fallback', async () => {
      const $ = await get$('/resolve-fallback')
      expect($('body').text()).toMatch(/Hello from only b/)
    })

    it('should resolve a single matching alias', async () => {
      const $ = await get$('/single-alias')
      expect($('body').text()).toMatch(/Hello/)
    })

    it('should resolve a wildcard alias', async () => {
      const $ = await get$('/wildcard-alias')
      expect($('body').text()).toMatch(/world/)
    })

    it('should have correct module not found error', async () => {
      const basicPage = join(appDir, 'pages/basic-alias.js')
      const contents = await fs.readFile(basicPage, 'utf8')

      await fs.writeFile(basicPage, contents.replace('@c/world', '@c/worldd'))
      await renderViaHTTP(appPort, '/basic-alias')

      const found = await check(
        () => output,
        /Module not found: Can't resolve '@c\/worldd'/,
        false
      )
      await fs.writeFile(basicPage, contents)
      expect(found).toBe(true)
    })
  })
})
