/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../')

const runTests = () => {
  it('should handle / correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })

  it('should handle /index correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from index')
  })

  it('should handle /index/index correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/index/index')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('page could not be found')
  })
}

describe('Route index handling', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
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
