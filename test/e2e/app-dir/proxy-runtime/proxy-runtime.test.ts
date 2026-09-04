import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('proxy-runtime', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should error when proxy file has runtime config export', async () => {
    let cliOutput: string

    if (isNextDev) {
      await next.start().catch(() => {})
      // Use .catch() because Turbopack errors during compile and exits before runtime.
      await next.browser('/').catch(() => {})
      cliOutput = next.cliOutput
    } else {
      cliOutput = (await next.build()).cliOutput
    }

    // TODO: Investigate why in dev-turbo, the error is shown in the browser console, not CLI output.
    if (process.env.IS_TURBOPACK_TEST && !isNextDev) {
      expect(stripAnsi(cliOutput)).toContain(`proxy.ts:3:14
Error: Next.js can't recognize the exported \`config\` field in route. Proxy does not support Edge runtime.
  1 | export default function () {}
  2 |
> 3 | export const config = { runtime: 'edge' }
    |              ^^^^^^
  4 |

The exported configuration object in a source file needs to have a very specific format from which some properties can be statically parsed at compiled-time.`)
    } else {
      expect(cliOutput).toContain(
        `Route segment config is not allowed in Proxy file at "./proxy.ts". Proxy always runs on Node.js runtime. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
      )
    }

    await next.stop()
  })
})
