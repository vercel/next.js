/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Head', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should render static heads', async () => {
    const html = await renderViaHTTP(appPort, '/static-head')
    expect(html).toMatch(/<title>Static Title<\/title>/)
  })

  it('should render dynamic heads', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic-head')
    expect(html).toMatch(/<title>Dynamic Title<\/title>/)
  })

  it('should support _app.js heads', async () => {
    const html = await renderViaHTTP(appPort, '/mixin-head')
    expect(html).toMatch(
      /<title>Title from _app.js<\/title><meta name="author" content="foo"\/>/
    )
  })
})
