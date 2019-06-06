/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { existsSync } from 'fs'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  renderViaHTTP
} from 'next-test-utils'
const appDir = join(__dirname, '../')
const serverlessDir = join(appDir, '.next/serverless/pages')
let appPort
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Serverless', () => {
  beforeAll(async () => {
    await nextBuild(appDir, [], {
      env: { __NEXT_BUILDER_EXPERIMENTAL_TARGET: 'serverless' }
    })
    appPort = await findPort()
    app = await nextStart(appDir, appPort, {
      env: { __NEXT_BUILDER_EXPERIMENTAL_TARGET: 'serverless' }
    })
  })
  afterAll(() => killApp(app))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello Serverless/)
  })

  it('should have rendered the index page to serverless build', () => {
    expect(existsSync(join(serverlessDir, 'index.js'))).toBeTruthy()
  })

  it('should not output _app.js and _document.js to serverless build', () => {
    expect(existsSync(join(serverlessDir, '_app.js'))).toBeFalsy()
    expect(existsSync(join(serverlessDir, '_document.js'))).toBeFalsy()
  })
})
