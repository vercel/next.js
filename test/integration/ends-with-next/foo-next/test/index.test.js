/* eslint-env jest */

import path from 'path'
import {
  nextBuild,
  nextStart,
  launchApp,
  findPort,
  killApp,
  fetchViaHTTP,
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')
let app
let appPort

const runTest = () => {
  it('Has correct initial ref values', async () => {
    const res = await fetchViaHTTP(appPort, '/api/server')
    expect(await res.json()).toBe(true)
  })
}

describe('Containing folder name ends with "next"', () => {
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  })

  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTest()
  })
})
