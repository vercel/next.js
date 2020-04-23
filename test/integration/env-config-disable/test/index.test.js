/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import {
  nextBuild,
  findPort,
  launchApp,
  killApp,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const monorepoRoot = join(__dirname, '../app')
const yarnLock = join(monorepoRoot, 'yarn.lock')
const lernaConf = join(monorepoRoot, 'lerna.json')
const appDir = join(monorepoRoot, 'packages/sub-app')

let app
let appPort

const runTests = () => {
  describe('dev mode', () => {
    it('should start dev server without errors', async () => {
      let stderr = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })

      const html = await renderViaHTTP(appPort, '/')
      await killApp(app)

      expect(html).toContain('hi')
      expect(stderr).not.toContain('Failed to load env')
    })
  })

  describe('production mode', () => {
    it('should build app successfully', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      expect(code).toBe(0)
      expect((stderr || '').length).toBe(0)
    })

    it('should start without error', async () => {
      let stderr = ''
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })

      const html = await renderViaHTTP(appPort, '/')
      await killApp(app)

      expect(html).toContain('hi')
      expect(stderr).not.toContain('Failed to load env')
    })
  })
}

describe('Env support disabling', () => {
  describe('with yarn based monorepo', () => {
    beforeAll(() => fs.writeFile(yarnLock, 'test'))
    afterAll(() => fs.remove(yarnLock))

    runTests()
  })

  describe('with lerna based monorepo', () => {
    beforeAll(() => fs.writeFile(lernaConf, 'test'))
    afterAll(() => fs.remove(lernaConf))

    runTests()
  })
})
