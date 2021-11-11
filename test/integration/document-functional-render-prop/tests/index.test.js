/* eslint-env jest */

import { join } from 'path'
import { findPort, launchApp, killApp, renderViaHTTP } from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

describe('Functional Custom Document', () => {
  describe('development mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    afterAll(() => killApp(app))

    it('supports render props', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/<span>from render prop<\/span>/)
    })
  })
})
