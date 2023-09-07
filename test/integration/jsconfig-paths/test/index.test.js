/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import stripAnsi from 'next/dist/compiled/strip-ansi'
import * as path from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  nextBuild,
  killApp,
  check,
  File,
} from 'next-test-utils'
import * as JSON5 from 'json5'

const appDir = join(__dirname, '..')
let appPort
let app

async function get$(path, query) {
  const html = await renderViaHTTP(appPort, path, query)
  return cheerio.load(html)
}

function runTests() {
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
        () => stripAnsi(output),
        /Module not found: Can't resolve '@c\/worldd'/,
        false
      )
      await fs.writeFile(basicPage, contents)
      expect(found).toBe(true)
    })
  })

  describe('should build', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
    })
    it('should trace correctly', async () => {
      const appTrace = await fs.readJSON(
        join(appDir, '.next/server/pages/_app.js.nft.json')
      )
      const singleAliasTrace = await fs.readJSON(
        join(appDir, '.next/server/pages/single-alias.js.nft.json')
      )
      const wildcardAliasTrace = await fs.readJSON(
        join(appDir, '.next/server/pages/wildcard-alias.js.nft.json')
      )
      const resolveOrderTrace = await fs.readJSON(
        join(appDir, '.next/server/pages/resolve-order.js.nft.json')
      )
      const resolveFallbackTrace = await fs.readJSON(
        join(appDir, '.next/server/pages/resolve-fallback.js.nft.json')
      )
      const basicAliasTrace = await fs.readJSON(
        join(appDir, '.next/server/pages/basic-alias.js.nft.json')
      )
      expect(
        appTrace.files.some((file) => file.includes('node_modules/next'))
      ).toBe(true)
      expect(
        singleAliasTrace.files.some((file) =>
          file.includes('components/hello.js')
        )
      ).toBe(false)
      expect(
        wildcardAliasTrace.files.some((file) =>
          file.includes('mypackage/myfile.js')
        )
      ).toBe(true)
      expect(
        wildcardAliasTrace.files.some((file) =>
          file.includes('mypackage/data.js')
        )
      ).toBe(false)
      expect(
        resolveOrderTrace.files.some((file) => file.includes('lib/a/api.js'))
      ).toBe(false)
      expect(
        resolveOrderTrace.files.some((file) =>
          file.includes('mypackage/data.js')
        )
      ).toBe(true)
      expect(
        resolveFallbackTrace.files.some((file) =>
          file.includes('lib/b/b-only.js')
        )
      ).toBe(false)
      expect(
        basicAliasTrace.files.some((file) =>
          file.includes('components/world.js')
        )
      ).toBe(false)
    })
  })
}

describe('jsconfig paths', () => {
  runTests()
})

const jsconfig = new File(path.resolve(__dirname, '../jsconfig.json'))

describe('jsconfig paths without baseurl', () => {
  beforeAll(() => {
    const jsconfigContent = JSON5.parse(jsconfig.originalContent)
    delete jsconfigContent.compilerOptions.baseUrl
    jsconfigContent.compilerOptions.paths = {
      '@c/*': ['./components/*'],
      '@lib/*': ['./lib/a/*', './lib/b/*'],
      '@mycomponent': ['./components/hello.js'],
      '*': ['./node_modules/*'],
    }
    jsconfig.write(JSON.stringify(jsconfigContent, null, 2))
  })

  afterAll(() => {
    jsconfig.restore()
  })

  runTests()
})
