import path from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import {
  findPort,
  killApp,
  launchApp,
  renderViaHTTP,
  runNextCommand,
  retry,
} from 'next-test-utils'

describe('page features telemetry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (process.env.IS_TURBOPACK_TEST) {
    it('detects --turbo correctly for `next dev`', async () => {
      const port = await findPort()
      let stderr = ''

      const handleStderr = (msg) => {
        stderr += msg
      }
      const app = await launchApp(next.testDir, port, {
        onStderr: handleStderr,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
        turbo: true,
      })
      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STARTED/)
      })
      await renderViaHTTP(port, '/hello')

      if (app) {
        await killApp(app)
      }

      try {
        expect(stderr).toContain('NEXT_CLI_SESSION_STARTED')
        const event1 = /NEXT_CLI_SESSION_STARTED[\s\S]+?{([\s\S]+?)}/
          .exec(stderr)
          .pop()

        expect(event1).toMatch(/"pagesDir": true/)
        expect(event1).toMatch(/"turboFlag": true/)
      } catch (err) {
        require('console').error('failing stderr', stderr, err)
        throw err
      }
    })

    it('detects --turbo correctly for `next dev` stopped', async () => {
      const port = await findPort()
      let stderr = ''

      const handleStderr = (msg) => {
        stderr += msg
      }
      const app = await launchApp(next.testDir, port, {
        onStderr: handleStderr,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
        turbo: true,
      })

      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STARTED/)
      })
      await renderViaHTTP(port, '/hello')

      if (app) {
        await killApp(app, 'SIGTERM')
      }
      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STOPPED/)
      })

      expect(stderr).toContain('NEXT_CLI_SESSION_STOPPED')
      const event1 = /NEXT_CLI_SESSION_STOPPED[\s\S]+?{([\s\S]+?)}/
        .exec(stderr)
        .pop()

      expect(event1).toMatch(/"pagesDir": true/)
      expect(event1).toMatch(/"turboFlag": true/)

      expect(
        await fs.pathExists(path.join(next.testDir, '.next/_events.json'))
      ).toBe(false)
    })
  } else {
    it('detects correctly for `next dev` stopped (no turbo)', async () => {
      const port = await findPort()
      let stderr = ''

      const handleStderr = (msg) => {
        stderr += msg
      }
      const app = await launchApp(next.testDir, port, {
        onStderr: handleStderr,
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STARTED/)
      })
      await renderViaHTTP(port, '/hello')

      if (app) {
        await killApp(app, 'SIGTERM')
      }

      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STOPPED/)
      })

      expect(stderr).toContain('NEXT_CLI_SESSION_STOPPED')
      const event1 = /NEXT_CLI_SESSION_STOPPED[\s\S]+?{([\s\S]+?)}/
        .exec(stderr)
        .pop()

      expect(event1).toMatch(/"turboFlag": false/)
      expect(event1).toMatch(/"pagesDir": true/)
      expect(event1).toMatch(/"appDir": true/)

      expect(
        await fs.pathExists(path.join(next.testDir, '.next/_events.json'))
      ).toBe(false)
    })
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        it('should detect app page counts', async () => {
          await fs.ensureFile(path.join(next.testDir, 'app/ssr/page.js'))
          await fs.writeFile(
            path.join(next.testDir, 'app/ssr/page.js'),
            `
          export const revalidate = 0
          export default function Page() {
            return <p>ssr page</p>
          }
        `
          )
          await fs.ensureFile(path.join(next.testDir, 'app/edge-ssr/page.js'))
          await fs.writeFile(
            path.join(next.testDir, 'app/edge-ssr/page.js'),
            `
          export const runtime = 'edge'
          export default function Page() {
            return <p>edge-ssr page</p>
          }
        `
          )
          await fs.ensureFile(
            path.join(next.testDir, 'app/app-ssg/[slug]/page.js')
          )
          await fs.writeFile(
            path.join(next.testDir, 'app/app-ssg/[slug]/page.js'),
            `
          export function generateStaticParams() {
            return [
              { slug: 'post-1' },
              { slug: 'post-2' },
            ]
          }
          export default function Page() {
            return <p>ssg page</p>
          }
        `
          )
          const { stderr } = await runNextCommand(['build', next.testDir], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: '1' },
          })

          try {
            expect(stderr).toContain('NEXT_BUILD_OPTIMIZED')
            const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
              .exec(stderr)
              .pop()
            expect(event1).toMatch(/"staticPropsPageCount": 2/)
            expect(event1).toMatch(/"serverPropsPageCount": 2/)
            expect(event1).toMatch(/"ssrPageCount": 3/)
            expect(event1).toMatch(/"staticPageCount": 5/)
            expect(event1).toMatch(/"totalPageCount": 12/)
            expect(event1).toMatch(/"totalAppPagesCount": 6/)
            expect(event1).toMatch(/"serverAppPagesCount": 2/)
            expect(event1).toMatch(/"edgeRuntimeAppCount": 1/)
            expect(event1).toMatch(/"edgeRuntimePagesCount": 2/)

            expect(stderr).toContain('NEXT_BUILD_COMPLETED')
            const event2 = /NEXT_BUILD_COMPLETED[\s\S]+?{([\s\S]+?)}/
              .exec(stderr)
              .pop()

            expect(event2).toMatch(/"totalAppPagesCount": 6/)
          } catch (err) {
            require('console').error('failing stderr', stderr, err)
            throw err
          }
        })

        it('detects reportWebVitals with no _app correctly for `next build`', async () => {
          const build = await runNextCommand(['build', next.testDir], {
            stderr: 'log',
            stdout: 'log',
            env: { NEXT_TELEMETRY_DEBUG: '1' },
          })

          expect(build.stderr).toContain('NEXT_BUILD_OPTIMIZED')
          const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
            .exec(build.stderr)
            .pop()
          expect(event1).toMatch(/hasReportWebVitals.*?false/)
        })

        it('detect with reportWebVitals correctly for `next build`', async () => {
          await fs.utimes(
            path.join(next.testDir, 'pages', '_app_withreportwebvitals.empty'),
            new Date(),
            new Date()
          )
          await fs.rename(
            path.join(next.testDir, 'pages', '_app_withreportwebvitals.empty'),
            path.join(next.testDir, 'pages', '_app.js')
          )

          const build = await runNextCommand(['build', next.testDir], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: '1' },
          })

          await fs.rename(
            path.join(next.testDir, 'pages', '_app.js'),
            path.join(next.testDir, 'pages', '_app_withreportwebvitals.empty')
          )

          try {
            expect(build.stderr).toContain('NEXT_BUILD_OPTIMIZED')
            const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
              .exec(build.stderr)
              .pop()
            expect(event1).toMatch(/hasReportWebVitals.*?true/)
          } catch (err) {
            require('console').error(build.stderr)
            throw err
          }
        })

        it('detect without reportWebVitals correctly for `next build`', async () => {
          await fs.utimes(
            path.join(
              next.testDir,
              'pages',
              '_app_withoutreportwebvitals.empty'
            ),
            new Date(),
            new Date()
          )
          await fs.rename(
            path.join(
              next.testDir,
              'pages',
              '_app_withoutreportwebvitals.empty'
            ),
            path.join(next.testDir, 'pages', '_app.js')
          )

          const build = await runNextCommand(['build', next.testDir], {
            stderr: true,
            env: { NEXT_TELEMETRY_DEBUG: '1' },
          })

          await fs.rename(
            path.join(next.testDir, 'pages', '_app.js'),
            path.join(
              next.testDir,
              'pages',
              '_app_withoutreportwebvitals.empty'
            )
          )

          try {
            expect(build.stderr).toContain('NEXT_BUILD_OPTIMIZED')
            const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
              .exec(build.stderr)
              .pop()
            expect(event1).toMatch(/hasReportWebVitals.*?false/)
          } catch (err) {
            require('console').error(build.stderr)
            throw err
          }
        })
      }
    )
  }
})
