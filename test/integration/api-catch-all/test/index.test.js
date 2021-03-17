/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

function runTests() {
  it('should return data when catch-all', async () => {
    const data = await fetchViaHTTP(appPort, '/api/users/1', null, {}).then(
      (res) => res.ok && res.json()
    )

    expect(data).toEqual({ slug: ['1'] })
  })

  it('should return redirect when catch-all with index and trailing slash', async () => {
    const res = await fetchViaHTTP(appPort, '/api/users/', null, {
      redirect: 'manual',
    })
    expect(res.status).toBe(308)
  })

  it('should return data when catch-all with index and trailing slash', async () => {
    const data = await fetchViaHTTP(appPort, '/api/users/', null, {}).then(
      (res) => res.ok && res.json()
    )

    expect(data).toEqual({})
  })

  it('should return data when catch-all with index and no trailing slash', async () => {
    const data = await fetchViaHTTP(appPort, '/api/users', null, {}).then(
      (res) => res.ok && res.json()
    )

    expect(data).toEqual({})
  })
}

describe('API routes', () => {
  describe('dev support', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('Server support', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('Serverless support', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfig)
    })

    runTests()
  })
})
