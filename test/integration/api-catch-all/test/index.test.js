/* eslint-env jest */
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
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
    const text = await res.text()
    console.log('### ', text)
    expect(text).toEqual('/api/users')
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
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
