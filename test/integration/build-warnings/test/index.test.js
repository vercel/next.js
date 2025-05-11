/* eslint-env jest */

import { remove } from 'fs-extra'
import { File, nextBuild, waitFor } from 'next-test-utils'
import { join } from 'path'

const appDir = join(__dirname, '../')

describe('Build warnings', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should not shown warning about minification without any modification', async () => {
        const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
        expect(stderr).not.toContain('optimization has been disabled')
      })
      ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
        'should shown warning about minification for minimize',
        async () => {
          const nextConfig = new File(join(appDir, 'next.config.js'))

          await waitFor(500)

          nextConfig.replace('true', 'false')

          const { stderr } = await nextBuild(appDir, undefined, {
            stderr: true,
          })

          // eslint-disable-next-line jest/no-standalone-expect
          expect(stderr).toContain('optimization has been disabled')

          nextConfig.restore()
        }
      )
      ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
        'should shown warning about minification for minimizer',
        async () => {
          const nextConfig = new File(join(appDir, 'next.config.js'))

          await waitFor(500)

          nextConfig.replace(
            'config.optimization.minimize = true',
            'config.optimization.minimizer = []'
          )

          const { stderr } = await nextBuild(appDir, undefined, {
            stderr: true,
          })

          // eslint-disable-next-line jest/no-standalone-expect
          expect(stderr).toContain('optimization has been disabled')

          nextConfig.restore()
        }
      )

      it('should not warn about missing cache in non-CI', async () => {
        await remove(join(appDir, '.next'))

        const { stdout } = await nextBuild(appDir, undefined, {
          stdout: true,
          env: {
            CI: '',
            CIRCLECI: '',
            TRAVIS: '',
            SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: '',
            GITHUB_ACTIONS: '',
            GITHUB_EVENT_NAME: '',
          },
        })
        expect(stdout).not.toContain('no-cache')
      })

      it('should not warn about missing cache on supported platforms', async () => {
        await remove(join(appDir, '.next'))

        const { stdout } = await nextBuild(appDir, undefined, {
          stdout: true,
          env: { CI: '1', NOW_BUILDER: '1' },
        })
        expect(stdout).not.toContain('no-cache')
      })

      it('should warn about missing cache in CI', async () => {
        await remove(join(appDir, '.next'))

        let { stdout } = await nextBuild(appDir, undefined, {
          stdout: true,
          env: { CI: '1' },
        })
        expect(stdout).toContain('no-cache')

        // Do not warn after cache is present
        ;({ stdout } = await nextBuild(appDir, undefined, {
          stdout: true,
          env: { CI: '1' },
        }))
        expect(stdout).not.toContain('no-cache')
      })
    }
  )
})
