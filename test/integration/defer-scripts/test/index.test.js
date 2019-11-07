/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  nextServer,
  runNextCommand,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'
import cheerio from 'cheerio'
const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

describe('Defer Scripts', () => {
  beforeAll(async () => {
    await runNextCommand(['build', appDir])

    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    context.appPort = appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('should have defer on all script tags', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    let missing = false

    for (const script of $('script').toArray()) {
      const { defer, type, src } = script.attribs
      // application/json doesn't need defer
      // polyfills cannot be deferred or async'd
      if (type === 'application/json' || src.includes('polyfills')) {
        continue
      }

      if (defer !== '') {
        missing = true
      }
    }
    expect(missing).toBe(false)
  })
})
