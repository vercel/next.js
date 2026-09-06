import type { ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs-extra'
import { nextTestSetup } from 'e2e-utils'
import { findPort, killApp, renderViaHTTP, retry } from 'next-test-utils'

describe('page features telemetry', () => {
  const { next, isTurbopack, isRspack, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // Calls `next.build()` directly which is not supported on `NextDeployInstance`.
    skipDeployment: true,
  })
  if (skipped) return

  async function launchDevServer(
    port: number,
    opts: {
      env?: Record<string, string>
      onStderr?: (msg: string) => void
      onStdout?: (msg: string) => void
    } = {}
  ): Promise<{ child: ChildProcess; exit: Promise<any> }> {
    let child!: ChildProcess
    let ready = false
    let resolveReady!: () => void
    const readyPromise = new Promise<void>((r) => {
      resolveReady = () => {
        if (!ready) {
          ready = true
          r()
        }
      }
    })

    const readyPattern = /- Local:|✓ Ready/i
    const exit = next
      .runCommand(['dev', next.testDir, '-p', String(port)], {
        env: opts.env,
        onStdout(msg) {
          opts.onStdout?.(msg)
          if (readyPattern.test(msg)) resolveReady()
        },
        onStderr(msg) {
          opts.onStderr?.(msg)
          if (readyPattern.test(msg)) resolveReady()
        },
        instance: (p) => {
          child = p
        },
      })
      .finally(() => {
        resolveReady()
      })

    await readyPromise
    return { child, exit }
  }

  if (isTurbopack) {
    it('detects --turbo correctly for `next dev`', async () => {
      const port = await findPort()
      let stderr = ''

      const { child, exit } = await launchDevServer(port, {
        onStderr(msg) {
          stderr += msg
        },
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })
      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STARTED/)
      })
      await renderViaHTTP(port, '/hello')

      if (child) {
        await killApp(child)
      }
      await exit.catch(() => {})

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

      const { child, exit } = await launchDevServer(port, {
        onStderr(msg) {
          stderr += msg
        },
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STARTED/)
      })
      await renderViaHTTP(port, '/hello')

      if (child) {
        await killApp(child, 'SIGTERM')
      }
      await exit.catch(() => {})
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
      // Rspack startup can take longer while restoring persistent cache state,
      // so give telemetry events a wider retry window.
      const retryDuration = isRspack ? 10_000 : 3_000
      let stderr = ''

      const { child, exit } = await launchDevServer(port, {
        onStderr(msg) {
          stderr += msg
        },
        env: {
          NEXT_TELEMETRY_DEBUG: '1',
        },
      })

      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STARTED/)
      }, retryDuration)
      await renderViaHTTP(port, '/hello')

      if (child) {
        await killApp(child, 'SIGTERM')
      }
      await exit.catch(() => {})

      await retry(async () => {
        expect(stderr).toMatch(/NEXT_CLI_SESSION_STOPPED/)
      }, retryDuration)

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
    ;(isNextStart ? describe : describe.skip)('production mode', () => {
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
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        try {
          expect(cliOutput).toContain('NEXT_BUILD_OPTIMIZED')
          const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
            .exec(cliOutput)
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

          expect(cliOutput).toContain('NEXT_BUILD_COMPLETED')
          const event2 = /NEXT_BUILD_COMPLETED[\s\S]+?{([\s\S]+?)}/
            .exec(cliOutput)
            .pop()

          expect(event2).toMatch(/"totalAppPagesCount": 6/)
        } catch (err) {
          require('console').error('failing cliOutput', cliOutput, err)
          throw err
        }
      })

      it('detects reportWebVitals with no _app correctly for `next build`', async () => {
        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        expect(cliOutput).toContain('NEXT_BUILD_OPTIMIZED')
        const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
          .exec(cliOutput)
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

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'pages', '_app.js'),
          path.join(next.testDir, 'pages', '_app_withreportwebvitals.empty')
        )

        try {
          expect(cliOutput).toContain('NEXT_BUILD_OPTIMIZED')
          const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
            .exec(cliOutput)
            .pop()
          expect(event1).toMatch(/hasReportWebVitals.*?true/)
        } catch (err) {
          require('console').error(cliOutput)
          throw err
        }
      })

      it('detect without reportWebVitals correctly for `next build`', async () => {
        await fs.utimes(
          path.join(next.testDir, 'pages', '_app_withoutreportwebvitals.empty'),
          new Date(),
          new Date()
        )
        await fs.rename(
          path.join(next.testDir, 'pages', '_app_withoutreportwebvitals.empty'),
          path.join(next.testDir, 'pages', '_app.js')
        )

        const { cliOutput } = await next.build({
          env: { NEXT_TELEMETRY_DEBUG: '1' },
        })

        await fs.rename(
          path.join(next.testDir, 'pages', '_app.js'),
          path.join(next.testDir, 'pages', '_app_withoutreportwebvitals.empty')
        )

        try {
          expect(cliOutput).toContain('NEXT_BUILD_OPTIMIZED')
          const event1 = /NEXT_BUILD_OPTIMIZED[\s\S]+?{([\s\S]+?)}/
            .exec(cliOutput)
            .pop()
          expect(event1).toMatch(/hasReportWebVitals.*?false/)
        } catch (err) {
          require('console').error(cliOutput)
          throw err
        }
      })
    })
  }
})
