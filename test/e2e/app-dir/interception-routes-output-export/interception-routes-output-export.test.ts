import { isNextDev, isNextStart } from 'e2e-utils'
import { findPort, killApp, launchApp, nextBuild, retry } from 'next-test-utils'

describe('interception-routes-output-export', () => {
  it('should error when using interception routes with static export', async () => {
    if (isNextStart) {
      const { code, stderr } = await nextBuild(__dirname, [], { stderr: true })
      expect(stderr).toContain(
        'Intercepting routes are not supported with static export.'
      )
      expect(code).toBe(1)
    } else if (isNextDev) {
      let stderr = ''
      const port = await findPort()
      const app = await launchApp(__dirname, port, {
        onStderr(msg) {
          stderr += msg || ''
        },
      })

      await retry(async () => {
        expect(stderr).toContain(
          'Intercepting routes are not supported with static export.'
        )
      })

      await killApp(app)
    }
  })
})
