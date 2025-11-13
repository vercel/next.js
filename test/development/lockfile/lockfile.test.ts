import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import stripAnsi from 'strip-ansi'

describe('lockfile', () => {
  const { next, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
  })

  it('only allows a single instance of `next dev` to run at a time', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('Page')

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
    expect(stripAnsi(stdout + stderr)).toContain('Unable to acquire lock')
    expect(exitCode).toBe(1)

    // make sure the other instance of `next dev` didn't mess anything up
    browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe('Page')
  })
})
