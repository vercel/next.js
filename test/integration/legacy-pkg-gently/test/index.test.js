/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  runNextCommand,
  nextServer,
  startApp,
  stopApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 5)

let app
let appPort
let server
const appDir = join(__dirname, '../')

describe('Legacy Packages', () => {
  beforeAll(async () => {
    await runNextCommand(['build', appDir])

    app = nextServer({
      dir: appDir,
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    appPort = server.address().port
  })

  it('should support `node-gently` packages', async () => {
    const res = await renderViaHTTP(appPort, '/api/hello')
    expect(res).toMatch(/hello world/i)
  })

  afterAll(() => stopApp(server))
})
