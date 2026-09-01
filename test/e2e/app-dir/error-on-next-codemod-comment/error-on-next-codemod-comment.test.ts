import { nextTestSetup } from 'e2e-utils'
import {
  waitForRedbox,
  waitForNoRedbox,
  getRedboxSource,
  retry,
} from 'next-test-utils'

describe('app-dir - error-on-next-codemod-comment', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })

    it('should error with swc if you have codemod comments left', async () => {
      const browser = await next.browser('/')

      await waitForRedbox(browser)

      if (process.env.IS_TURBOPACK_TEST) {
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "./app/page.tsx (2:2)
           Error: You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
               After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can be taken.
             1 | export default function Page() {
           > 2 |   // @next-codemod-error remove jsx of next line
               |  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
             3 |   return <p>hello world</p>
             4 | }
             5 |

           Ecmascript file had an error"
          `)
      } else if (process.env.NEXT_RSPACK) {
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
         "./app/page.tsx
           ╰─▶   × Error:   x You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
                 │   | After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can be taken.
                 │
                 │    ,-[2:1]
                 │  1 | export default function Page() {
                 │  2 |   // @next-codemod-error remove jsx of next line
                 │    :  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                 │  3 |   return <p>hello world</p>
                 │  4 | }
                 │    \`----
                 │"
        `)
      } else {
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
         "./app/page.tsx
         Error:   x You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
           | After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can be taken.

            ,-[2:1]
          1 | export default function Page() {
          2 |   // @next-codemod-error remove jsx of next line
            :  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          3 |   return <p>hello world</p>
          4 | }
            \`----"
        `)
      }
    })

    it('should error with inline comment as well', async () => {
      await next.patchFile(
        'app/page.tsx',
        (code) =>
          code.replace(
            '// @next-codemod-error remove jsx of next line',
            '/* @next-codemod-error remove jsx of next line */'
          ),
        async () => {
          const browser = await next.browser('/')
          await retry(async () => {
            await waitForRedbox(browser)
          }, 10000)
        }
      )
    })

    it('should disappear the error when you rre the codemod comment', async () => {
      const browser = await next.browser('/')

      await waitForRedbox(browser)

      await next.patchFile(
        'app/page.tsx',
        (code) =>
          code.replace('// @next-codemod-error remove jsx of next line', ''),
        async () => {
          await retry(async () => {
            await waitForNoRedbox(browser)
          }, 10000)
        }
      )
    })

    it('should disappear the error when you replace with bypass comment', async () => {
      const browser = await next.browser('/')

      await waitForRedbox(browser)

      await next.patchFile(
        'app/page.tsx',
        (code) => code.replace('@next-codemod-error', '@next-codemod-bypass'),
        async () => {
          await retry(async () => {
            await waitForNoRedbox(browser)
          }, 10000)
        }
      )
    })
  } else {
    it('should fail the build with next build', async () => {
      const res = await next.build()
      expect(res.exitCode).toBe(1)
      expect(res.cliOutput).toContain(
        'You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.'
      )
    })
  }
})
