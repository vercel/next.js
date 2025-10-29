/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  nextBuild,
  nextStart,
  killApp,
  launchApp,
  retry,
  waitFor,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const page404 = join(appDir, 'pages/404.js')
let appPort
let app

const customErrNo404Match =
  /You have added a custom \/_error page without a custom \/404 page/

describe('Custom _error', () => {
  describe('development mode 1', () => {
    let stderr = ''

    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
    })
    afterAll(() => killApp(app))

    it('should not warn with /_error and /404 when rendering error first', async () => {
      try {
        stderr = ''
        await fs.writeFile(page404, 'export default <h1>')
        await retry(async () => {
          // retry because the page might not be built yet
          const html = await renderViaHTTP(appPort, '/404')
          // Expected '</', got '<eof>'
          expect(html).toContain("Expected '\\u003c/', got '\\u003ceof\\u003e'")
          expect(stderr).not.toMatch(customErrNo404Match)
        })
      } finally {
        await fs.remove(page404)
        // Matches `next-dev.ts` patchFileDelay
        await waitFor(1000)
      }
    })
  })

  describe('development mode 2', () => {
    let stderr = ''

    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })
    })
    afterAll(() => killApp(app))

    it('should not warn with /_error and /404', async () => {
      stderr = ''
      try {
        await fs.writeFile(page404, `export default () => 'not found...'`)
        await retry(async () => {
          // retry because the page might not be built yet
          const html = await renderViaHTTP(appPort, '/404')
          expect(html).toContain('not found...')
          expect(stderr).not.toMatch(customErrNo404Match)
        })
      } finally {
        await fs.remove(page404)
        // Matches `next-dev.ts` patchFileDelay
        await waitFor(1000)
      }
    })

    it('should warn on custom /_error without custom /404', async () => {
      stderr = ''
      const html = await renderViaHTTP(appPort, '/404')
      expect(stderr).toMatch(customErrNo404Match)
      expect(html).toContain('An error 404 occurred on server')
    })
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let buildOutput = ''

      beforeAll(async () => {
        const { stdout, stderr } = await nextBuild(appDir, undefined, {
          stdout: true,
          stderr: true,
        })
        buildOutput = (stdout || '') + (stderr || '')
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      it('should not contain /_error in build output', async () => {
        expect(buildOutput).toMatch(/ƒ .*?\/404/)
        expect(buildOutput).not.toMatch(/ƒ .*?\/_error/)
      })

      it('renders custom _error successfully', async () => {
        const html = await renderViaHTTP(appPort, '/')
        expect(html).toMatch(/Custom error/)
      })
    }
  )
})
