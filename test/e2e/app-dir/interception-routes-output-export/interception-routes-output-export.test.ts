import type { ChildProcess } from 'child_process'
import { isNextDev, isNextStart, nextTestSetup } from 'e2e-utils'
import { findPort, killApp, retry } from 'next-test-utils'

describe('interception-routes-output-export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when using interception routes with static export', async () => {
    if (isNextStart) {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).toContain(
        'Intercepting routes are not supported with static export.'
      )
      expect(exitCode).toBe(1)
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
        await retry(async () => {
          expect(stderr).toContain(
            'Intercepting routes are not supported with static export.'
          )
        })
      } finally {
        if (child) {
          await killApp(child).catch(() => {})
        }
        await exit.catch(() => {})
      }
    }
  })
})
