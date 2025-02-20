import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('use-cache-segment-configs', () => {
  const { next, skipped, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it("it should error when using segment configs that aren't supported by useCache", async () => {
    if (isNextDev) {
      const browser = await next.browser('/runtime')

      if (isTurbopack) {
        await assertHasRedbox(browser)

        const description = await getRedboxDescription(browser)
        const source = await getRedboxSource(browser)

        expect(description).toBe('Failed to compile')

        expect(source).toMatchInlineSnapshot(`
         "./app/runtime/page.tsx (1:14)
         Ecmascript file had an error
         > 1 | export const runtime = 'edge'
             |              ^^^^^^^
           2 |
           3 | export default function Page() {
           4 |   return <div>This page uses \`export const runtime\`.</div>

         Route segment config "runtime" is not compatible with \`nextConfig.experimental.useCache\`. Please remove it."
        `)
      } else {
        // TODO(veil): Figure out why dev overlay is not shown with Webpack when
        // the runtime is 'edge'. It's possibly related to the import trace
        // being wrong (pointing at the Webpack loader resource).
        await assertNoRedbox(browser)
      }
    } else {
      const { cliOutput } = await next.build()

      const buildOutput = getBuildOutput(cliOutput)

      if (isTurbopack) {
        expect(buildOutput).toMatchInlineSnapshot(`
         "Error: Turbopack build failed with 1 errors:
         Page: {"type":"app","side":"server","page":"/runtime/page"}
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
