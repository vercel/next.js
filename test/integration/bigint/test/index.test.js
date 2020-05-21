/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  fetchViaHTTP,
  launchApp,
  nextBuild,
  nextStart,
  killApp,
  findPort,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

const runTests = () => {
  it('should return 200', async () => {
    const res = await fetchViaHTTP(appPort, '/api/bigint', null, {
      method: 'GET',
    })
    expect(res.status).toEqual(200)
  })

  it('should return the BigInt result text', async () => {
    const resText = await fetchViaHTTP(appPort, '/api/bigint', null, {
      method: 'GET',
    }).then((res) => res.ok && res.text())
    expect(resText).toEqual('3')
  })
}

describe('bigint API route support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await fs.remove(nextConfig)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('serverless mode', () => {
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
