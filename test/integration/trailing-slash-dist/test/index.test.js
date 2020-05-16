/* eslint-env jest */

import { join } from 'path'
import { killApp, findPort, launchApp, fetchViaHTTP } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')

let appPort
let app

const runTest = (mode = 'server') => {
  it('supports trailing slash', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/_next/static/development/pages/index.js'
    )

    expect(res.status).toBe(200)
  })
}

describe('Trailing slash in distDir', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTest('dev')
  })
})
