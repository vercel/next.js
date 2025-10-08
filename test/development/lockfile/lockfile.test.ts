import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'
import stripAnsi from 'strip-ansi'

describe('lockfile', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('only allows a single instance of `next dev` to run at a time', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('Page')

    const { stdout, stderr, exitCode } = await execa(
      'pnpm',
      ['next', 'dev', isTurbopack ? '--turbopack' : '--webpack'],
      {
        cwd: next.testDir,
        env: next.env as NodeJS.ProcessEnv,
        reject: false,
      }
    )
    expect(stripAnsi(stdout + stderr)).toContain('Unable to acquire lock')
    expect(exitCode).toBe(1)
  })
})
