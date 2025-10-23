import { nextTestSetup } from 'e2e-utils'

// Only Turbopack runs the transform on the layout once in edge and non-edge contexts
// so we only test this on Turbopack
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'cache-components-edge-deduplication',
  () => {
    const { next, skipped, isNextDev } = nextTestSetup({
      files: __dirname + '/fixtures/edge-deduplication',
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should not duplicate errors when layout is compiled for both edge and non-edge contexts', async () => {
      try {
        await next.start()
      } catch {
        // we expect the build to fail
      }

      if (isNextDev) {
        const browser = await next.browser('/edge-with-layout/edge')
        assertHasRedbox(browser)
        const redbox = {
          description: await getRedboxDescription(browser),
          source: await getRedboxSource(browser),
        }
        expect(redbox.description).toMatchInlineSnapshot(
          `"Ecmascript file had an error"`
        )
        expect(redbox.source).toMatchInlineSnapshot(`
         "./app/edge-with-layout/edge/page.tsx (1:14)
         Ecmascript file had an error
         > 1 | export const runtime = 'edge'
             |              ^^^^^^^
           2 |
           3 | export default function Page() {
           4 |   return <div>Test page under app/</div>

         Route segment config "runtime" is not compatible with \`nextConfig.cacheComponents\`. Please remove it."
        `)
        // Count occurrences of the layout error at the specific location
        const layoutErrorMatches = next.cliOutput.match(
          /\.\/app\/edge-with-layout\/layout\.tsx:1:14/g
        )
        // We don't show an error stack, just the individual error messages at each location
        expect(layoutErrorMatches?.length).toBe(1)
      } else {
        // Check that both the layout and edge page errors appear
        expect(next.cliOutput).toContain('./app/edge-with-layout/layout.tsx')
        expect(next.cliOutput).toContain('./app/edge-with-layout/edge/page.tsx')
        expect(next.cliOutput).toContain(
          '"dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
        )
        expect(next.cliOutput).toContain(
          '"runtime" is not compatible with `nextConfig.cacheComponents`. Please remove it.'
        )
        // Count occurrences of the layout error at the specific location
        const layoutErrorMatches = next.cliOutput.match(
          /\.\/app\/layout\.tsx:1:14/g
        )

        // Should appear exactly twice: once in the formatted error message, once in the stack trace
        expect(layoutErrorMatches?.length).toBe(2)
      }
    })
  }
)
