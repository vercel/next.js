/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  findPort,
  launchApp,
  killApp,
  nextBuild,
  nextStart,
  fetchViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
const appDir = join(__dirname, '../')

const runTests = () => {
  it('should handle / correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from index')
  })

  it('should handle /index correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from index')
  })

  it('should handle /nested-index/index correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/nested-index/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from nested index')
  })

  it('should handle /sub correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/sub')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from sub index')
  })

  it('should handle /sub/index correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/sub/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from sub id')
  })

  it('should handle /sub/another correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/sub/another')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hello from sub id')
  })

  it('should handle /api/sub correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/api/sub')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi from sub index')
  })

  it('should handle /api/sub/index correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/api/sub/index')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi from sub id')
  })

  it('should handle /api/sub/another correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/api/sub/another')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('hi from sub id')
  })
}

describe('Route indexes handling', () => {
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
