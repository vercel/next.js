import cheerio from 'cheerio'
import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '..')

const runTests = () => {
  it('should have gip in __NEXT_DATA__', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect(JSON.parse($('#__NEXT_DATA__').text()).gip).toBe(true)
  })

  it('should not have gip in __NEXT_DATA__ for non-GIP page', async () => {
    const html = await renderViaHTTP(appPort, '/normal')
    const $ = cheerio.load(html)
    expect('gip' in JSON.parse($('#__NEXT_DATA__').text())).toBe(false)
  })

  it('should have correct router.asPath for direct visit dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/1')
    const $ = cheerio.load(html)
    expect($('#as-path').text()).toBe('/blog/1')
  })

  it('should have correct router.asPath for direct visit dynamic page rewrite direct', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post/1')
    const $ = cheerio.load(html)
    expect($('#as-path').text()).toBe('/blog/post/1')
  })
}

describe('getInitialProps', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
