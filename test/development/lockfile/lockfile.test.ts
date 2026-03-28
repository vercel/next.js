import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import fs from 'fs'
import os from 'os'
import path from 'path'
import stripAnsi from 'strip-ansi'

describe('lockfile', () => {
  const { next, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
  })

  afterAll(() => {
    // Clean up global lockfile created during test
    const globalLockDir = path.join(os.homedir(), '.next', 'dev', next.appPort)
    fs.rmSync(globalLockDir, { recursive: true, force: true })
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
        ? 'Run taskkill /PID \\d+ /F to stop it\\.'
        : 'Run kill \\d+ to stop it\\.'
    const errorPattern = new RegExp(
      'Another next dev server is already running\\.\\s*' +
        '- Local:\\s+http://[^\\s]+\\s+' +
        '- PID:\\s+\\d+\\s+' +
        '- Dir:\\s+[^\\s]+\\s+' +
        '- Log:\\s+\\.next/dev/logs/next-development\\.log\\s+' +
        killPattern
    )
    expect(output).toMatch(errorPattern)
    expect(exitCode).toBe(1)

    // Make sure the other instance of `next dev` didn't mess anything up
    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe('Page')
  })

  it('creates a global lockfile at ~/.next/dev/<port>/lock with flock held', async () => {
    const globalLockfilePath = path.join(
      os.homedir(),
      '.next',
      'dev',
      next.appPort,
      'lock'
    )
    expect(fs.existsSync(globalLockfilePath)).toBe(true)

    // Verify lockfile content has correct server info
    const serverInfo = JSON.parse(fs.readFileSync(globalLockfilePath, 'utf-8'))
    expect(serverInfo).toMatchObject({
      pid: expect.any(Number),
      port: Number(next.appPort),
      hostname: 'localhost',
      appUrl: expect.stringContaining(next.appPort),
      startedAt: expect.any(Number),
    })

    // Verify the process from the lockfile is actually alive
    const isAlive = (() => {
      try {
        process.kill(serverInfo.pid, 0)
        return true
      } catch {
        return false
      }
    })()
    expect(isAlive).toBe(true)
  })
})
