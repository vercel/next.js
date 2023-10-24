/* eslint-env jest */

import { join } from 'path'
import {
  nextBuild,
  findPort,
  nextStart,
  killApp,
  launchApp,
  renderViaHTTP,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '../')

// Turbopack does not support AMP rendering.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'AMP Custom Validator',
  () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        it('should build and start successfully', async () => {
          const { code } = await nextBuild(appDir)
          expect(code).toBe(0)

          appPort = await findPort()
          app = await nextStart(appDir, appPort)

          const html = await renderViaHTTP(appPort, '/')
          await killApp(app)

          expect(html).toContain('Hello from AMP')
        })
      }
    )

    describe('development mode', () => {
      it('should run in dev mode successfully', async () => {
        let stderr = ''

        appPort = await findPort()
        app = await launchApp(appDir, appPort, {
          onStderr(msg) {
            stderr += msg || ''
          },
        })

        const html = await renderViaHTTP(appPort, '/')
        await killApp(app)

        expect(stderr).not.toContain('error')
        expect(html).toContain('Hello from AMP')
      })
    })
  }
)
