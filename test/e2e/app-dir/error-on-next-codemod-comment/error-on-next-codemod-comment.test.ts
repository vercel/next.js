import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxSource,
  retry,
} from 'next-test-utils'

describe('app-dir - error-on-next-codemod-comment', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  const isNewDevOverlay =
    process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })

    it('should error with swc if you have codemod comments left', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      // TODO(new-dev-overlay): Remove this once old dev overlay fork is removed
      if (isNewDevOverlay) {
        if (process.env.TURBOPACK) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "./app/page.tsx (2:2)
           Ecmascript file had an error
             1 | export default function Page() {
           > 2 |   // @next-codemod-error remove jsx of next line
               |  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
             3 |   return <p>hello world</p>
             4 | }
             5 |

           You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
           After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can be taken."
          `)
        } else {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "./app/page.tsx
           Error:   x You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
             | After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can
             | be taken.
             | 
              ,-[2:1]
            1 | export default function Page() {
            2 |   // @next-codemod-error remove jsx of next line
              :  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
            3 |   return <p>hello world</p>
            4 | }
              \`----"
          `)
        }
      } else {
        if (process.env.TURBOPACK) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
           "./app/page.tsx (2:2)
           Ecmascript file had an error
             1 | export default function Page() {
           > 2 |   // @next-codemod-error remove jsx of next line
               |  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
             3 |   return <p>hello world</p>
             4 | }
             5 |

           You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
           After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can be taken."
          `)
        } else {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
                     "./app/page.tsx
                     Error:   x You have an unresolved @next/codemod comment "remove jsx of next line" that needs review.
                       | After review, either remove the comment if you made the necessary changes or replace "@next-codemod-error" with "@next-codemod-ignore" to bypass the build error if no action at this line can
                       | be taken.
                       | 
                        ,-[2:1]
                      1 | export default function Page() {
                      2 |   // @next-codemod-error remove jsx of next line
                        :  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                      3 |   return <p>hello world</p>
                      4 | }
                        \`----"
                  `)
        }
      }
    })

    it('should error with inline comment as well', async () => {
      let originFileContent
      await next.patchFile('app/page.tsx', (code) => {
        originFileContent = code
        return code.replace(
          '// @next-codemod-error remove jsx of next line',
          '/* @next-codemod-error remove jsx of next line */'
        )
      })

      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      // Recover the original file content
      await next.patchFile('app/page.tsx', originFileContent)
    })

    it('should disappear the error when you rre the codemod comment', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      let originFileContent
      await next.patchFile('app/page.tsx', (code) => {
        originFileContent = code
        return code.replace(
          '// @next-codemod-error remove jsx of next line',
          ''
        )
      })

      await retry(async () => {
        await assertNoRedbox(browser)
      })

      // Recover the original file content
      await next.patchFile('app/page.tsx', originFileContent)
    })

    it('should disappear the error when you replace with bypass comment', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      let originFileContent
      await next.patchFile('app/page.tsx', (code) => {
        originFileContent = code
        return code.replace('@next-codemod-error', '@next-codemod-bypass')
      })

      await retry(async () => {
        await assertNoRedbox(browser)
      })

      // Recover the original file content
      await next.patchFile('app/page.tsx', originFileContent)
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
