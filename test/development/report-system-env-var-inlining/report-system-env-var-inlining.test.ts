import { nextTestSetup } from 'e2e-utils'

// Only implemented in Turbopack
import { getRedboxSource, waitForRedbox } from 'next-test-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'report-system-env-var-inlining',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should report when inlining system env vars', async () => {
      const browser = await next.browser('/')
      await waitForRedbox(browser)

      const error = await getRedboxSource(browser)
      expect(error).toMatchInlineSnapshot(`
       "./app/foo.tsx (2:14)
       TP1202 The commit hash is being inlined.
         1 | export function Foo() {
       > 2 |   return <p>{process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA}</p>
           |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 | }
         4 |

       This variable changes frequently, causing slower deploy times and worse browser client-side caching. Consider using \`process.env.NEXT_DEPLOYMENT_ID\` to identify a deployment. Alternatively, use \`process.env.VERCEL_GIT_COMMIT_SHA\` in server side code and for browser code, remove it.

       Import trace:
         Server Component:
           ./app/foo.tsx
           ./app/page.tsx"
      `)
    })
  }
)
