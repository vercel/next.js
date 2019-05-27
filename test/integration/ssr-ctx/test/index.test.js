/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30

const appDir = join(__dirname, '../')
let appPort
let app

describe('Production Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should render a page with context', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Value: .*?hello world/)
  })
})
