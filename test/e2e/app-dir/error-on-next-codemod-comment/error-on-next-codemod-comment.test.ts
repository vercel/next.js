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

  if (isNextDev) {
    beforeAll(async () => {
      await next.start()
    })

    it('should error with swc if you have codemod comments left', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      if (process.env.TURBOPACK) {
        // TODO: support turbopack
      } else {
        expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
          "./app/page.tsx
          Error:   x You have unresolved @next/codemod comment needs to be removed, please address and remove it to proceed build.
            | Action: " remove jsx of next line"
             ,-[2:1]
           1 | export default function Page() {
           2 |   // Next.js Dynamic Async API Codemod: remove jsx of next line
             :  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
           3 |   return <p>hello world</p>
           4 | }
             \`----"
        `)
      }
    })

    it('should disappear the error when you remove the codemod comment', async () => {
      const browser = await next.browser('/')

      await assertHasRedbox(browser)

      await next.patchFile(
        'app/page.tsx',
        `
        export default function Page() { return <p>hello world</p> }
      `
      )

      await retry(async () => {
        await assertNoRedbox(browser)
      })
    })
  } else {
    it('should fail the build with next build', async () => {
      const res = await next.build()
      expect(res.exitCode).toBe(1)
      expect(res.cliOutput).toContain(
        'You have unresolved @next/codemod comment needs to be removed, please address and remove it to proceed build.'
      )
    })
  }
})
