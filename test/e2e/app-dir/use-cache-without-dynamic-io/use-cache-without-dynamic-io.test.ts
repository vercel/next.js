import { nextTestSetup } from 'e2e-utils'
import { NextConfig } from 'next'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
  getRedboxSource,
  retry,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const nextConfigWithDynamicIO: NextConfig = {
  experimental: { dynamicIO: true },
}

describe('use-cache-without-dynamic-io', () => {
  const { next, isNextStart, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: process.env.NEXT_TEST_MODE !== 'dev',
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('should fail the build with an error', async () => {
      const { cliOutput } = await next.build()
      const buildOutput = getBuildOutput(cliOutput)

      if (isTurbopack) {
        expect(buildOutput).toMatchInlineSnapshot(`
          "Error: Turbopack build failed with 1 errors:
          Page: {"type":"app","side":"server","page":"/page"}
          ./app/page.tsx:1:1
          Ecmascript file had an error
          > 1 | 'use cache'
              | ^^^^^^^^^^^
            2 |
            3 | export default async function Page() {
            4 |   return <p>hello world</p>

          To use "use cache", please enable the experimental feature flag "dynamicIO" in your Next.js config.

          Read more: https://nextjs.org/docs/canary/app/api-reference/directives/use-cache#usage



              at <unknown> (./app/page.tsx:1:1)
          "
        `)
      } else {
        expect(buildOutput).toMatchInlineSnapshot(`
          "
          ./app/page.tsx
          Error:   x To use "use cache", please enable the experimental feature flag "dynamicIO" in your Next.js config.
            | 
            | Read more: https://nextjs.org/docs/canary/app/api-reference/directives/use-cache#usage
            | 
             ,-[1:1]
           1 | 'use cache'
             : ^^^^^^^^^^^
           2 | 
           3 | export default async function Page() {
           4 |   return <p>hello world</p>
             \`----

          Import trace for requested module:
          ./app/page.tsx


          > Build failed because of webpack errors
          "
        `)
      }
    })
  } else {
    it('should show a build error', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      expect(errorDescription).toBe('Failed to compile')

      if (isTurbopack) {
        expect(errorSource).toMatchInlineSnapshot(`
          "./app/page.tsx:1:1
          Ecmascript file had an error
          > 1 | 'use cache'
              | ^^^^^^^^^^^
            2 |
            3 | export default async function Page() {
            4 |   return <p>hello world</p>

          To use "use cache", please enable the experimental feature flag "dynamicIO" in your Next.js config.

          Read more: https://nextjs.org/docs/canary/app/api-reference/directives/use-cache#usage"
        `)
      } else {
        expect(errorSource).toMatchInlineSnapshot(`
          "./app/page.tsx
          Error:   x To use "use cache", please enable the experimental feature flag "dynamicIO" in your Next.js config.
            | 
            | Read more: https://nextjs.org/docs/canary/app/api-reference/directives/use-cache#usage
            | 
             ,-[1:1]
           1 | 'use cache'
             : ^^^^^^^^^^^
           2 | 
           3 | export default async function Page() {
           4 |   return <p>hello world</p>
             \`----"
        `)
      }
    })

    it('should recover from the build error if dynamicIO flag is set', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify(nextConfigWithDynamicIO)}`,
        () =>
          retry(async () => {
            expect(await browser.elementByCss('p').text()).toBe('hello world')
            await assertNoRedbox(browser)
          })
      )
    })
  }
})

function getBuildOutput(cliOutput: string): string {
  const lines: string[] = []
  let skipLines = true

  for (const line of cliOutput.split('\n')) {
    if (!skipLines) {
      if (line.includes('at turbopackBuild')) {
        break
      }

      lines.push(stripAnsi(line))
    } else if (
      line.includes('Build error occurred') ||
      line.includes('Failed to compile')
    ) {
      skipLines = false
    }
  }

  return lines.join('\n')
}
