/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  launchApp,
  nextBuild,
  nextStart,
  killApp,
  findPort,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
let appPort
let app

const runTests = () => {
  it('should support optional chaining', async () => {
    const html = await renderViaHTTP(appPort, '/optional-chaining')
    expect(html).toMatch(/result1:.*?nothing/)
    expect(html).toMatch(/result2:.*?something/)
  })

  it('should support nullish coalescing', async () => {
    const html = await renderViaHTTP(appPort, '/nullish-coalescing')
    expect(html).toMatch(/result1:.*?fallback/)
    expect(html).not.toMatch(/result2:.*?fallback/)
  })
}

describe('Optional chaining and nullish coalescing support', () => {
  describe('dev mode', () => {
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
