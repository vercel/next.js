import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('proxy-runtime', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
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
      await expect(next.start()).rejects.toThrow()
      cliOutput = next.cliOutput
    }

    // TODO: Investigate why in dev-turbo, the error is shown in the browser console, not CLI output.
    if (process.env.IS_TURBOPACK_TEST && !isNextDev) {
      const expected = `proxy.ts:3:14
Error: Next.js can't recognize the exported \`config\` field in route. Proxy does not support Edge runtime.
  1 | export default function () {}
  2 |
> 3 | export const config = { runtime: 'edge' }
    |              ^^^^^^
  4 |

The exported configuration object in a source file needs to have a very specific format from which some properties can be statically parsed at compiled-time.`
      // Deployment logs add timestamps and remove code-frame indentation.
      const normalize = (output: string) =>
        isNextDeploy
          ? output
              .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z {2}/gm, '')
              .replace(/^[ \t]+/gm, '')
          : output
      expect(normalize(stripAnsi(cliOutput))).toContain(normalize(expected))
    } else {
      expect(cliOutput).toContain(
        `Route segment config is not allowed in Proxy file at "./proxy.ts". Proxy always runs on Node.js runtime. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
      )
    }

    if (isNextDev) await next.stop()
  }, 240_000)
})
