import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

let app
let appPort
const appDir = join(__dirname, '..')

const runTests = () => {
  const consoleSpy = jest.spyOn(console, 'log')

  it('should print web-vitals to console', async () => {
    await webdriver(appPort, '/')
    await waitFor(1000)
    expect(consoleSpy).toBeCalledWith({})
  })
}

describe('useReportWebVitals', () => {
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
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
