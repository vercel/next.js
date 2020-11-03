/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let appPort
let app

describe('Image Component Domain Pattern', () => {
  describe('next dev', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should render the valid Image usage and not print error', async () => {
      const html = await renderViaHTTP(appPort, '/valid', {})
      expect(html).toMatch(/This is a valid domain/)
      expect(html).not.toMatch(/hostname .* is not configured under images/)
    })

    it('should print error when invalid Image usage', async () => {
      const html = await renderViaHTTP(appPort, '/invalid', {})
      expect(html).toMatch(/hostname .* is not configured under images/)
      expect(html).not.toMatch(/This is a page with errors/)
    })
  })
})
