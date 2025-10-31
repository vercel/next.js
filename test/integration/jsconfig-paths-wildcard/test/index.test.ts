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
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should resolve a wildcard alias', async () => {
      const $ = await get$('/wildcard-alias')
      expect($('body').text()).toMatch(/world/)
    })
  })
}

describe('jsconfig paths wildcard', () => {
  runTests()
})

const jsconfig = new File(path.resolve(__dirname, '../jsconfig.json'))

describe('jsconfig paths without baseurl wildcard', () => {
  beforeAll(() => {
    const jsconfigContent = JSON5.parse(jsconfig.originalContent)
    delete jsconfigContent.compilerOptions.baseUrl
    jsconfigContent.compilerOptions.paths = {
      '*': ['./node_modules/*'],
    }
    jsconfig.write(JSON.stringify(jsconfigContent, null, 2))
  })

  afterAll(() => {
    jsconfig.restore()
  })

  runTests()
})
