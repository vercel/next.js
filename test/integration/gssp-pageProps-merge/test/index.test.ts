/* eslint-env jest */

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

const appDir = join(__dirname, '..')

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
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        const { code } = await nextBuild(appDir)
        if (code !== 0) throw new Error(`build failed with code ${code}`)

        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
