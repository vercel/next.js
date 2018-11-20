/* eslint-env jest */
/* global jasmine, test */
import { join } from 'path'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const context = {}

describe('Lambdas', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    context.appPort = appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello World/)
  })
})
