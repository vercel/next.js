/* eslint-env jest */

import { join } from 'path'
import { findPort, launchApp, killApp, renderViaHTTP } from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

describe('Functional Custom Document useLegacyGetInitialProps Hook', () => {
  describe('development mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })

    afterAll(() => killApp(app))

    it('supports the useLegacyGetInitialProps hook', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/<span>hello from legacy gip<\/span>/)
    })
  })
})
