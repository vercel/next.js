/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, launchApp, findPort, killApp } from 'next-test-utils'

let server
let appPort

describe('Dynamic require', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(join(__dirname, '../'), appPort)
  })
  afterAll(() => killApp(server))

  it('should not throw error when dynamic require is used', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/If you can see this then we are good/)
  })
})
