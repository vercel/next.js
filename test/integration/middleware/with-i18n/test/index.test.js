/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

const context = {}
context.appDir = join(__dirname, '../')

jest.setTimeout(1000 * 60 * 2)

describe('Middleware i18n tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort)
    })

    afterAll(() => killApp(context.app))
    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(context.appDir, undefined, {
        stderr: true,
        stdout: true,
      })

      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })

    afterAll(() => killApp(context.app))
    runTests()
  })
})

function runTests() {
  it(`reads the locale from the pathname`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/fr', { country: 'spain' })

    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#locale').text()).toBe('fr')
    expect($('#country').text()).toBe('spain')
  })

  it(`rewrites from a locale correctly`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/', { 'my-locale': 'es' })

    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#locale').text()).toBe('es')
    expect($('#country').text()).toBe('us')
  })
}
