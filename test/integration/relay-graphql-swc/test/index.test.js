/* eslint-env jest */
import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')

const runTests = () => {
  it('should resolve index page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('Hello, World!')
  })
}

describe('Error no pageProps', () => {
  describe.only('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })

    afterAll(() => killApp(app))

    runTests()
  })
})
