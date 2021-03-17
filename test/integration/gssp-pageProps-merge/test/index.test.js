/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  findPort,
  launchApp,
  killApp,
  renderViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

let appPort
let app

const runTests = () => {
  it('should merge _app pageProps and getServerSideProps props', async () => {
    const html = await renderViaHTTP(appPort, '/gssp')
    const $ = cheerio.load(html)
    expect(JSON.parse($('p').text())).toEqual({ hi: 'hi', hello: 'world' })
  })

  it('should merge _app pageProps and getStaticProps props', async () => {
    const html = await renderViaHTTP(appPort, '/gsp')
    const $ = cheerio.load(html)
    expect(JSON.parse($('p').text())).toEqual({ hi: 'hi', hello: 'world' })
  })
}

describe('pageProps GSSP conflict', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const { code } = await nextBuild(appDir)
      if (code !== 0) throw new Error(`build failed with code ${code}`)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = {
        target: 'experimental-serverless-trace'
      }`
      )
      const { code } = await nextBuild(appDir)
      if (code !== 0) throw new Error(`build failed with code ${code}`)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.remove(nextConfig)
      await killApp(app)
    })

    runTests()
  })
})
