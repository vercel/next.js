/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, launchApp, findPort, killApp } from 'next-test-utils'

jest.setTimeout(1000 * 30)

let server
let appPort

describe('Dynamic require', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(join(__dirname, '../'), appPort)
  })
  afterAll(() => killApp(server))

  it('should show error when a Next prop is returned in _app.getInitialProps', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/\/cant-override-next-props/)
  })
})
