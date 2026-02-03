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
       error TP1202 A system environment variable is being inlined. This variable changes on every deployment, causing slower deploy times and worse browser client-side caching. For server-side code, replace with \`process.env.VERCEL_GIT_COMMIT_SHA\` and for browser code, try to remove it.
         1 | export function Foo() {
       > 2 |   return <p>{process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA}</p>
           |              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         3 | }
         4 |

       Import trace:
         Server Component:
           ./app/foo.tsx
           ./app/page.tsx"
      `)
    })
  }
)
