import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  getRedboxDescription,
  getRedboxSource,
} from 'next-test-utils'

describe('app-dir - server-component-next-dynamic-ssr-false', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should error when use dynamic ssr:false in server component', async () => {
    const browser = await next.browser('/')
    await assertHasRedbox(browser)
    const redbox = {
      description: await getRedboxDescription(browser),
      source: await getRedboxSource(browser),
    }

    if (process.env.IS_TURBOPACK_TEST) {
      expect(redbox.description).toMatchInlineSnapshot(
        `"Ecmascript file had an error"`
      )
      expect(redbox.source).toMatchInlineSnapshot(`
       "./app/page.js (3:23)
       Ecmascript file had an error
         1 | import dynamic from 'next/dynamic'
         2 |
       > 3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
           |                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         4 |
         5 | export default function Page() {
         6 |   return <DynamicClient />

       \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a Client Component."
      `)
    } else if (process.env.NEXT_RSPACK) {
      expect(redbox.description).toMatchInlineSnapshot(
        `"  × Module build failed:"`
      )
      expect(redbox.source).toMatchInlineSnapshot(`
       "./app/page.js
         × Module build failed:
         ╰─▶   × Error:   x \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a Client Component.
               │    ,-[3:1]
               │  1 | import dynamic from 'next/dynamic'
               │  2 |
               │  3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
               │    :                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
               │  4 |
               │  5 | export default function Page() {
               │  6 |   return <DynamicClient />
               │    \`----
               │"
      `)
    } else {
      expect(redbox.description).toMatchInlineSnapshot(
        `"  x \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a Client Component."`
      )
      expect(redbox.source).toMatchInlineSnapshot(`
         "./app/page.js
         Error:   x \`ssr: false\` is not allowed with \`next/dynamic\` in Server Components. Please move it into a Client Component.
            ,-[3:1]
          1 | import dynamic from 'next/dynamic'
          2 | 
          3 | const DynamicClient = dynamic(() => import('./client'), { ssr: false })
            :                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          4 | 
          5 | export default function Page() {
          6 |   return <DynamicClient />
            \`----"
        `)
    }
  })
})
