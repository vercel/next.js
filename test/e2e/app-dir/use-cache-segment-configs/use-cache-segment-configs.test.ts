import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('use-cache-segment-configs', () => {
  const { next, skipped, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
    skipDeployment: true,
  })

  const isRspack = !!process.env.NEXT_RSPACK

  if (skipped) {
    return
  }

  it("it should error when using segment configs that aren't supported by useCache", async () => {
    if (isNextDev) {
      const browser = await next.browser('/runtime')

      await assertHasRedbox(browser)

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Ecmascript file had an error",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/runtime/page.tsx (1:14)
         Ecmascript file had an error
         > 1 | export const runtime = 'edge'
             |              ^^^^^^^",
           "stack": [],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  × Module build failed:",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "<FIXME-nextjs-internal-source>
           × Module build failed:
           ╰─▶   × Error:   x Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
                 │    ,-[1:1]
                 │  1 | export const runtime = 'edge'
                 │    :              ^^^^^^^
                 │  2 |
                 │  3 | export default function Page() {
                 │  4 |   return <div>This page uses \`export const runtime\`.</div>
                 │    \`----
                 │",
           "stack": [],
         }
        `)
      } else {
        // FIXME: Fix broken import trace for Webpack loader resource.
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  x Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "<FIXME-nextjs-internal-source>
         Error:   x Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
            ,-[1:1]
          1 | export const runtime = 'edge'
            :              ^^^^^^^
          2 |
          3 | export default function Page() {
          4 |   return <div>This page uses \`export const runtime\`.</div>
            \`----",
           "stack": [],
         }
        `)
      }
    } else {
      const { cliOutput } = await next.build()

      const buildOutput = getBuildOutput(cliOutput)

      if (isTurbopack) {
        expect(buildOutput).toMatchInlineSnapshot(`
         "Error: Turbopack build failed with 1 errors:
         ./app/runtime/page.tsx:1:14
         Ecmascript file had an error
         > 1 | export const runtime = 'edge'
             |              ^^^^^^^
           2 |
           3 | export default function Page() {
           4 |   return <div>This page uses \`export const runtime\`.</div>

         Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.


             at <unknown> (./app/runtime/page.tsx:1:14)
         "
        `)
      } else if (isRspack) {
        expect(buildOutput).toMatchInlineSnapshot(`
         "
         // TODO(veil): Fix broken import trace for Webpack loader resource.
           × Module build failed:
           ╰─▶   × Error:   x Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
                 │    ,-[1:1]
                 │  1 | export const runtime = 'edge'
                 │    :              ^^^^^^^
                 │  2 |
                 │  3 | export default function Page() {
                 │  4 |   return <div>This page uses \`export const runtime\`.</div>
                 │    \`----
                 │
               
         Import trace for requested module:
         // TODO(veil): Fix broken import trace for Webpack loader resource.


         > Build failed because of Rspack errors
         "
        `)
      } else {
        expect(buildOutput).toMatchInlineSnapshot(`
         "
         // TODO(veil): Fix broken import trace for Webpack loader resource.
         Error:   x Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
            ,-[1:1]
          1 | export const runtime = 'edge'
            :              ^^^^^^^
          2 | 
          3 | export default function Page() {
          4 |   return <div>This page uses \`export const runtime\`.</div>
            \`----

         Import trace for requested module:
         // TODO(veil): Fix broken import trace for Webpack loader resource.


         > Build failed because of webpack errors
         "
        `)
      }
    }
  })
})

function getBuildOutput(cliOutput: string): string {
  const lines: string[] = []
  let skipLines = true

  for (const line of cliOutput.split('\n')) {
    if (!skipLines) {
      if (line.includes('__next_edge_ssr_entry__')) {
        lines.push(
          '// TODO(veil): Fix broken import trace for Webpack loader resource.'
        )
      } else {
        lines.push(stripAnsi(line))
      }
    } else if (
      line.includes('Build error occurred') ||
      line.includes('Failed to compile')
    ) {
      skipLines = false
    }
  }

  return lines.join('\n')
}
