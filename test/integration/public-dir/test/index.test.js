/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Public Files', () => {
  describe('Production', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      app = nextServer({
        dir: join(__dirname, '../'),
        dev: false,
        quiet: true,
      })

      server = await startApp(app)
      appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    describe('With basic usage', () => {
      it('should render the page', async () => {
        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Hello World/)
      })

      it('should stream the file', async () => {
        const html = await renderViaHTTP(appPort, '/test+this.txt')
        expect(html).toMatch(/i have a plus/)
      })
    })
  })
})
