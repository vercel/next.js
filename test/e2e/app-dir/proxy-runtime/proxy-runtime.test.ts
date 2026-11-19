import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('proxy-runtime', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  // @force-gate !deploy
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
    if (isTurbopack && !isNextDev) {
      expect(getBuildError(cliOutput)).toMatchInlineSnapshot(`
       "Error: Turbopack build failed with 1 error:
       ./proxy.ts:3:14
       Error: Next.js can't recognize the exported \`config\` field in route. Proxy does not support Edge runtime.
       1 | export default function () {}
       2 |
       > 3 | export const config = { runtime: 'edge' }
       |              ^^^^^^
       4 |
       The exported configuration object in a source file needs to have a very specific format from which some properties can be statically parsed at compiled-time.
       https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
       at printBuildErrors (<next-internal>)"
      `)
    } else {
      expect(cliOutput).toContain(
        `Route segment config is not allowed in Proxy file at "./proxy.ts". Proxy always runs on Node.js runtime. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`
      )
    }

    if (isNextDev) await next.stop()
  }, 240_000)
})

// Normalize compiler code frames and install-specific stack paths.
function getBuildError(cliOutput: string): string {
  const lines: string[] = []
  let capturing = false

  for (const rawLine of stripAnsi(cliOutput).split('\n')) {
    const line = rawLine.trim()

    if (capturing) {
      if (line.includes('at turbopackBuild')) {
        break
      }

      if (line) {
        lines.push(
          // Framework frames are intentionally printed unsourcemapped (the
          // build process has no source maps); their install-specific paths
          // are not stable.
          line.replace(
            /(at (?:async )?[\w$.]+) \([^)]*node_modules\/next\/dist[^)]*\)/,
            '$1 (<next-internal>)'
          )
        )
      }
    } else if (line.includes('Build error occurred')) {
      capturing = true
    }
  }

  return lines.join('\n')
}
