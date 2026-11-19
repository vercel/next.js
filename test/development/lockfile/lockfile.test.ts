import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import fs from 'fs'
import path from 'path'
import stripAnsi from 'strip-ansi'
import { retry } from 'next-test-utils'

describe('lockfile', () => {
  const { next, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
    nextConfig: { experimental: { requestInsights: true } },
  })

  it.each(['default', 'explicit', 'fallback'] as const)(
    'rejects a second dev server without announcing its %s port',
    async (portMode) => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('Page')

      // Verify lockfile was created with server info inside it
      // With isolatedDevBuild (default), distDir is .next/dev
      const distDir = path.join(next.testDir, '.next', 'dev')
      const lockfilePath = path.join(distDir, 'lock')
      expect(fs.existsSync(lockfilePath)).toBe(true)

      // Read server info from the lockfile itself
      const serverInfo = JSON.parse(fs.readFileSync(lockfilePath, 'utf-8'))
      expect(serverInfo).toMatchObject({
        pid: expect.any(Number),
        port: expect.any(Number),
        hostname: expect.any(String),
        appUrl: expect.any(String),
        startedAt: expect.any(Number),
      })

      const journalPath = path.join(distDir, 'request-insights.ndjson')
      await retry(() => {
        expect(fs.readFileSync(journalPath, 'utf-8').length).toBeGreaterThan(0)
      })
      const recordedHistory = fs.readFileSync(journalPath, 'utf-8')

      // Try to start another dev server - should fail with helpful error
      const { stdout, stderr, exitCode } = await execa(
        portMode === 'fallback' ? process.execPath : 'pnpm',
        portMode === 'fallback'
          ? [
              '-e',
              // Exercise automatic port retry without depending on port 3000
              // being available for the first server in the test environment.
              `require('next/dist/server/lib/start-server').startServer({
              dir: process.cwd(),
              port: ${next.appPort},
              isDev: true,
              allowRetry: true,
            })`,
            ]
          : [
              'next',
              'dev',
              ...(isRspack ? [] : [isTurbopack ? '--turbopack' : '--webpack']),
              ...(portMode === 'explicit' ? ['--port', '0'] : []),
            ],
        {
          cwd: next.testDir,
          env: {
            ...next.env,
            NODE_ENV: 'development',
            TURBOPACK: isTurbopack ? '1' : undefined,
          },
          reject: false,
        }
      )

      const output = stripAnsi(stdout + stderr)

      // Match the whole error message pattern with fuzzy matching for dynamic parts
      // The kill command varies by platform: `kill <pid>` on Unix, `taskkill /PID <pid> /F` on Windows
      const killPattern =
        process.platform === 'win32'
          ? 'or run taskkill /PID \\d+ /F to stop it and start a new one\\.'
          : 'or run kill \\d+ to stop it and start a new one\\.'
      const errorPattern = new RegExp(
        'Another next dev server is already running\\.\\s*' +
          '- Local:\\s+http://[^\\s]+\\s+' +
          '- PID:\\s+\\d+\\s+' +
          '- Dir:\\s+[^\\s]+\\s+' +
          '- Log:\\s+\\.next/dev/logs/next-development\\.log\\s+' +
          'You can access the existing server at http://[^\\s]+,\\s+' +
          killPattern
      )
      expect(output).toMatch(errorPattern)
      expect(output).not.toContain('Ready in')
      expect(output).not.toContain('using available port')
      expect(output.match(/- Local:/g)).toHaveLength(1)
      expect(exitCode).toBe(1)
      expect(
        fs.readFileSync(journalPath, 'utf-8').startsWith(recordedHistory)
      ).toBe(true)

      // Make sure the other instance of `next dev` didn't mess anything up
      await browser.refresh()
      expect(await browser.elementByCss('p').text()).toBe('Page')
    }
  )
})
