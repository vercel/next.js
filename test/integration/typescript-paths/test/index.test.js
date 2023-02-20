/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import * as path from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
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
}

describe('typescript paths', () => {
  runTests()
})

const tsconfig = new File(path.resolve(__dirname, '../tsconfig.json'))

describe('typescript paths without baseurl', () => {
  beforeAll(async () => {
    const tsconfigContent = JSON5.parse(tsconfig.originalContent)
    delete tsconfigContent.compilerOptions.baseUrl
    tsconfigContent.compilerOptions.paths = {
      'isomorphic-unfetch': ['./types/unfetch.d.ts'],
      '@c/*': ['./components/*'],
      '@lib/*': ['./lib/a/*', './lib/b/*'],
      '@mycomponent': ['./components/hello.tsx'],
      'd-ts-alias': [
        './components/alias-to-d-ts.d.ts',
        './components/alias-to-d-ts.tsx',
      ],
    }
    tsconfig.write(JSON.stringify(tsconfigContent, null, 2))
  })

  afterAll(() => {
    tsconfig.restore()
  })

  runTests()
})
