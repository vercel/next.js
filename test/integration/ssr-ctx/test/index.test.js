/* eslint-env jest */

import { join } from 'path'
import {
  File,
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
  check,
  launchApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
const appPg = new File(join(appDir, 'pages/_app.js'))

let appPort
let app

const runTests = (isDev) => {
  it('should render a page with context', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Value: .*?hello world/)
  })

  if (isDev) {
    it('should render with context after change', async () => {
      appPg.replace('hello world', 'new value')

      try {
        await check(() => renderViaHTTP(appPort, '/'), /Value: .*?new value/)
      } finally {
        appPg.restore()
      }
      await check(() => renderViaHTTP(appPort, '/'), /Value: .*?hello world/)
    })
  }
}

describe('React Context', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      appPg.restore()
    })

    runTests(true)
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
