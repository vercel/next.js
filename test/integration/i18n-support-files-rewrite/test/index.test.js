/* eslint-env jest */

import { join } from 'path'
import {
  launchApp,
  killApp,
  findPort,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should return 200 on rewrited image path', async () => {
    // Default path
    const resImagePath = await fetchViaHTTP(appPort, '/test.jpg', null, {
      method: 'GET',
    })

    expect(resImagePath.status).toEqual(200)

    // Rewrited path
    const resRewriteImagePath = await fetchViaHTTP(
      appPort,
      '/base/test.jpg',
      null,
      {
        method: 'GET',
      }
    )

    expect(resRewriteImagePath.status).toEqual(200)
  })
}

describe('Custom routes i18n', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
