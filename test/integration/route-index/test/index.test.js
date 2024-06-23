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

  it('should handle /index/?bar%60%3C%25%22%27%7B%24%2A%25%5C correctly', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/index/?bar%60%3C%25%22%27%7B%24%2A%25%5C'
    )
    expect(res.status).toBe(200)
  })

  it('should handle /index?file%3A%5C correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/index?file%3A%5C')
    expect(res.status).toBe(200)
  })
}

describe('Route index handling', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
