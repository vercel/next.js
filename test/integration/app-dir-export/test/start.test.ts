/* eslint-env jest */

import { join } from 'path'
import fs from 'fs-extra'
import {
  check,
  File,
  findPort,
  killApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const distDir = join(appDir, '.next')
const exportDir = join(appDir, 'out')
const nextConfig = new File(join(appDir, 'next.config.js'))
let app

describe('app dir - with output export (next start)', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    afterEach(async () => {
      await killApp(app)
      nextConfig.restore()
      await fs.remove(distDir)
      await fs.remove(exportDir)
    })

    it('should error during next start with output export', async () => {
      const { code } = await nextBuild(appDir)
      expect(code).toBe(0)
      const port = await findPort()
      let stderr = ''
      app = await nextStart(appDir, port, {
        onStderr(msg: string) {
          stderr += msg || ''
        },
      })
      await check(() => stderr, /error/i)
      expect(stderr).toContain(
        '"next start" does not work with "output: export" configuration. Use "npx serve@latest out" instead.'
      )
    })

    it('should warn during next start with output standalone', async () => {
      nextConfig.replace(`output: 'export'`, `output: 'standalone'`)
      const { code } = await nextBuild(appDir)
      expect(code).toBe(0)
      const port = await findPort()
      let stderr = ''
      app = await nextStart(appDir, port, {
        onStderr(msg: string) {
          stderr += msg || ''
        },
      })
      await check(() => stderr, /⚠/i)
      expect(stderr).toContain(
        `"next start" does not work with "output: standalone" configuration. Use "node .next/standalone/server.js" instead.`
      )
    })
  })
})
