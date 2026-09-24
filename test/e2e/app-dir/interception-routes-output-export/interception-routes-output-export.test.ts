import type { ChildProcess } from 'child_process'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import { findPort, killApp, retry } from 'next-test-utils'

describe('interception-routes-output-export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when using interception routes with static export', async () => {
    if (!isNextDev) {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(
        'Intercepting routes are not supported with static export.'
      )
    } else if (isNextDev) {
      let stderr = ''
      let child: ChildProcess | undefined
      const port = await findPort()
      const exit = next.runCommand(['dev', '-p', String(port)], {
        onStderr(msg) {
          stderr += msg || ''
        },
        instance: (p) => {
          child = p
        },
      })

      try {
        // The dev server can take a while to boot in CI before the
        // interception route check runs, so use a generous timeout.
        await retry(async () => {
          expect(stderr).toContain(
            'Intercepting routes are not supported with static export.'
          )
        }, 30 * 1000)
      } finally {
        if (child) {
          await killApp(child).catch(() => {})
        }
        await exit.catch(() => {})
      }
    }
  }, 240_000)
})
