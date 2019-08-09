/* eslint-env jest */
import webdriver from 'next-webdriver'
import { join } from 'path'
// import { readFileSync } from 'fs'
import { nextServer, runNextCommand, startApp, stopApp } from 'next-test-utils'

const appDir = join(__dirname, '../')
let server
// let serverDir
let app, appPort
// let buildId

describe('Chunking', () => {
  beforeAll(async () => {
    await runNextCommand(['build', appDir])

    app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    appPort = server.address().port

    // buildId = readFileSync(join(appDir, '.next/BUILD_ID'), 'utf8')
    // serverDir = join(appDir, '.next/server/static/', buildId, 'pages')
  })

  afterAll(() => {
    stopApp(server)
  })

  it('should test', async () => {
    const browser = await webdriver(appPort, '/')
    const text = await browser.elementByCss('.top-div').text()

    expect(text).toBe('Hello World')
    await browser.close()
  })
})
