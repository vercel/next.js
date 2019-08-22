/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import cheerio from 'cheerio'
import {
  renderViaHTTP,
  nextBuild,
  findPort,
  launchApp,
  killApp,
  File
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')
let appPort
let app

async function get$ (path, query) {
  const html = await renderViaHTTP(appPort, path, query)
  return cheerio.load(html)
}

describe('TypeScript Features', () => {
  describe('default behavior', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should render the page', async () => {
      const $ = await get$('/hello')
      expect($('body').text()).toMatch(/Hello World/)
    })
  })

  it('should compile the app', async () => {
    const output = await nextBuild(appDir, [], { stdout: true })
    expect(output.stdout).toMatch(/Compiled successfully/)
  })

  describe('should compile with different types', () => {
    it('should compile async getInitialProps for _error', async () => {
      const errorPage = new File(join(appDir, 'pages/_error.tsx'))
      try {
        errorPage.replace('static ', 'static async ')
        const output = await nextBuild(appDir, [], { stdout: true })
        expect(output.stdout).toMatch(/Compiled successfully/)
      } finally {
        errorPage.restore()
      }
    })
  })
})
