import { nextTestSetup } from 'e2e-utils'
import { waitForRedbox } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('use-cache-segment-configs', () => {
  const { next, isNextDev, isTurbopack, isRspack, isNextDeploy } =
    nextTestSetup({
      files: __dirname,
      skipStart: process.env.NEXT_TEST_MODE !== 'dev',
    })

  it("it should error when using segment configs that aren't supported by useCache", async () => {
    if (isNextDev) {
      const browser = await next.browser('/runtime')

      await waitForRedbox(browser)

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "./app/runtime/page.tsx (1:14)
         Error: Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
         > 1 | export const runtime = 'edge'
             |              ^^^^^^^",
           "stack": [],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "  ╰─▶   × Error:   x Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.",
           "environmentLabel": null,
           "label": "Build Error",
           "source": "<FIXME-nextjs-internal-source>
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
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput

      const buildOutput = getBuildOutput(cliOutput, isNextDeploy)

      if (isTurbopack && isNextDeploy) {
        // Vercel removes code-frame indentation and may omit blank log lines.
        expect(
          buildOutput
            .split('\n')
            .filter((line) => line.trim())
            .join('\n')
        ).toMatchInlineSnapshot(`
         "Error: Turbopack build failed with 1 error:
         ./app/runtime/page.tsx:1:14
         Error: Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
         > 1 | export const runtime = 'edge'
         |              ^^^^^^^
         2 |
         3 | export default function Page() {
         4 |   return <div>This page uses \`export const runtime\`.</div>
         Ecmascript file had an error
         at ignore-listed frames"
        `)
      } else if (isTurbopack) {
        expect(buildOutput).toMatchInlineSnapshot(`
         "Error: Turbopack build failed with 1 error:
         ./app/runtime/page.tsx:1:14
         Error: Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it.
         > 1 | export const runtime = 'edge'
             |              ^^^^^^^
           2 |
           3 | export default function Page() {
           4 |   return <div>This page uses \`export const runtime\`.</div>

         Ecmascript file had an error


             at ignore-listed frames
         "
        `)
      } else if (isRspack) {
        expect(buildOutput).toMatchInlineSnapshot(`
         "
         // TODO(veil): Fix broken import trace for Webpack loader resource.
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
      } else if (isNextDeploy) {
        // Vercel strips code-frame indentation and trailing whitespace from
        // the fetched build logs.
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


         > Build failed because of webpack errors"
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
  }, 240_000)
})

function getBuildOutput(cliOutput: string, isNextDeploy: boolean): string {
  const lines: string[] = []
  let skipLines = true

  for (const line of cliOutput.split('\n')) {
    // The command exit status and inspect metadata are not compiler output.
    if (isNextDeploy && /^Error: Command .* exited with \d+$/.test(line)) break
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
