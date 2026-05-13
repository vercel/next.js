import { nextTestSetup } from 'e2e-utils'
import { NextConfig } from 'next'
import {
  waitForRedbox,
  waitForNoRedbox,
  getRedboxDescription,
  getRedboxSource,
  retry,
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const nextConfigWithUseCache: NextConfig = {
  experimental: { useCache: true },
}

describe('use-cache-without-experimental-flag', () => {
  const { next, isNextStart, isTurbopack, skipped, isRspack } = nextTestSetup({
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
        expect(buildOutput).toContain(
          'To use "use cache", please enable the feature flag `cacheComponents` in your Next.js config.'
        )
        expect(buildOutput).toContain(
          'Read more: https://nextjs.org/docs/app/api-reference/directives/use-cache#usage'
        )
        expect(buildOutput).toContain('Ecmascript file had an error')
        expect(buildOutput).toContain('./app/page.tsx:1:1')
        expect(buildOutput).toContain("> 1 | 'use cache'")
        expect(buildOutput).toContain('at <unknown> (./app/page.tsx:1:1)')
      } else if (isRspack) {
        expect(buildOutput).toMatchInlineSnapshot(`
         "
         ./app/page.tsx
           ╰─▶   × Error:   x To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config.
                 │   |
                 │   | Read more: https://nextjs.org/docs/app/api-reference/directives/use-cache#usage
                 │
                 │    ,-[1:1]
                 │  1 | 'use cache'
                 │    : ^^^^^^^^^^^
                 │  2 |
                 │  3 | export default async function Page() {
                 │  4 |   return <p>hello world</p>
                 │    \`----
                 │
               
         Import trace for requested module:
         ./app/page.tsx


         > Build failed because of Rspack errors
         "
        `)
      } else {
        expect(buildOutput).toMatchInlineSnapshot(`
         "
         ./app/page.tsx
         Error:   x To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config.
           |
           | Read more: https://nextjs.org/docs/app/api-reference/directives/use-cache#usage

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

      await waitForRedbox(browser)

      const errorDescription = await getRedboxDescription(browser)
      const errorSource = await getRedboxSource(browser)

      if (isTurbopack) {
        expect(errorDescription).toMatchInlineSnapshot(
          `"To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config."`
        )
      } else if (isRspack) {
        expect(errorDescription).toMatchInlineSnapshot(
          `"  ╰─▶   × Error:   x To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config."`
        )
      } else {
        expect(errorDescription).toMatchInlineSnapshot(
          `"  x To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config."`
        )
      }

      if (isTurbopack) {
        expect(errorSource).toContain('./app/page.tsx (1:1)')
        expect(errorSource).toContain(
          'To use "use cache", please enable the feature flag `cacheComponents` in your Next.js config.'
        )
        expect(errorSource).toContain(
          'Read more: https://nextjs.org/docs/app/api-reference/directives/use-cache#usage'
        )
        expect(errorSource).toContain("> 1 | 'use cache'")
        expect(errorSource).toContain('Ecmascript file had an error')
      } else if (isRspack) {
        expect(errorSource).toMatchInlineSnapshot(`
         "./app/page.tsx
           ╰─▶   × Error:   x To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config.
                 │   |
                 │   | Read more: https://nextjs.org/docs/app/api-reference/directives/use-cache#usage
                 │
                 │    ,-[1:1]
                 │  1 | 'use cache'
                 │    : ^^^^^^^^^^^
                 │  2 |
                 │  3 | export default async function Page() {
                 │  4 |   return <p>hello world</p>
                 │    \`----
                 │"
        `)
      } else {
        expect(errorSource).toMatchInlineSnapshot(`
         "./app/page.tsx
         Error:   x To use "use cache", please enable the feature flag \`cacheComponents\` in your Next.js config.
           |
           | Read more: https://nextjs.org/docs/app/api-reference/directives/use-cache#usage

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

    it('should recover from the build error if useCache flag is set', async () => {
      const browser = await next.browser('/')

      await waitForRedbox(browser)

      await next.patchFile(
        'next.config.js',
        `module.exports = ${JSON.stringify(nextConfigWithUseCache)}`,
        () =>
          retry(async () => {
            expect(await browser.elementByCss('p').text()).toBe('hello world')
            await waitForNoRedbox(browser)
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
