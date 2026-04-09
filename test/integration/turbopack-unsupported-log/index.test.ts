import {
  check,
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
} from 'next-test-utils'
import fs from 'fs-extra'
import { join } from 'path'

describe('turbopack unsupported features log', () => {
  if (process.env.IS_TURBOPACK_TEST) {
    const appDir = join(__dirname, 'app')

    it('should not warn by default', async () => {
      let output = ''
      const appPort = await findPort()
      const app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })

      try {
        expect(await renderViaHTTP(appPort, '/')).toContain('hello world')
        expect(output).toContain('(Turbopack)')
        expect(output).not.toContain(
          'You are using configuration and/or tools that are not yet'
        )
      } finally {
        await killApp(app).catch(() => {})
      }
    })
    const nextConfigPath = join(appDir, 'next.config.js')

    it('should not warn with empty next.config.js', async () => {
      let output = ''
      await fs.writeFile(nextConfigPath, `module.exports = {}`)
      const appPort = await findPort()
      const app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })

      try {
        expect(output).toContain('(Turbopack)')
        expect(output).not.toContain(
          'You are using configuration and/or tools that are not yet'
        )

        expect(await renderViaHTTP(appPort, '/')).toContain('hello world')
      } finally {
        await killApp(app).catch(() => {})
        await fs.remove(nextConfigPath)
      }
    })

    it('should warn with next.config.js with unsupported field', async () => {
      let output = ''
      await fs.writeFile(
        nextConfigPath,
        `module.exports = {
          experimental: {
            urlImports: true
          }
        }`
      )
      const appPort = await findPort()
      const app = await launchApp(appDir, appPort, {
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      })

      try {
        await check(() => {
          expect(output).toContain('(Turbopack)')
          expect(output).toContain(
            'You are using configuration and/or tools that are not yet'
          )
          return 'success'
        }, /success/)
      } finally {
        await killApp(app).catch(() => {})
        await fs.remove(nextConfigPath)
      }
    })
  } else {
    it.skip('turbopack only', () => {})
  }
})
