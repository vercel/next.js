import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import fs from 'fs'
import path from 'path'
import stripAnsi from 'strip-ansi'
import {
  findPort,
  launchApp,
  retry,
  fetchViaHTTP,
  killApp,
} from 'next-test-utils'
import { once } from 'events'

describe('lockfile', () => {
  const { next, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
  })

  it('only allows a single instance of `next dev` to run at a time', async () => {
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

    // Try to start another dev server - should fail with helpful error
    const { stdout, stderr, exitCode } = await execa(
      'pnpm',
      [
        'next',
        'dev',
        ...(isRspack ? [] : [isTurbopack ? '--turbopack' : '--webpack']),
      ],
      {
        cwd: next.testDir,
        env: next.env as NodeJS.ProcessEnv,
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
    expect(exitCode).toBe(1)

    // Make sure the other instance of `next dev` didn't mess anything up
    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe('Page')
  })

  if (process.platform !== 'win32') {
    it('releases the lockfile immediately when the dev server child process is killed', async () => {
      const appPort = await findPort()
      const app = await launchApp(next.testDir, appPort)

      try {
        // Verify the dev server is running
        await retry(async () => {
          const res = await fetchViaHTTP(appPort, '/')
          expect(res.status).toBe(200)
        })

        // Read the lockfile to get the child PID
        const distDir = path.join(next.testDir, '.next', 'dev')
        const lockfilePath = path.join(distDir, 'lock')
        expect(fs.existsSync(lockfilePath)).toBe(true)

        const serverInfo = JSON.parse(fs.readFileSync(lockfilePath, 'utf-8'))
        const childPid = serverInfo.pid

        // Kill the child process (this is what users do when following
        // the error message's instructions)
        const exitPromise = once(app, 'exit')
        process.kill(childPid, 'SIGTERM')

        // The parent process should also exit
        await exitPromise

        // The lockfile should be released so a new dev server can start.
        // Use a short retry window — the lockfile should already be released
        // by the time we get here since it's released synchronously on signal.
        const newPort = await findPort()
        const newApp = await launchApp(next.testDir, newPort)
        try {
          await retry(async () => {
            const res = await fetchViaHTTP(newPort, '/')
            expect(res.status).toBe(200)
          })
        } finally {
          await killApp(newApp)
        }
      } finally {
        await killApp(app).catch(() => {})
      }
    })
  }
})
