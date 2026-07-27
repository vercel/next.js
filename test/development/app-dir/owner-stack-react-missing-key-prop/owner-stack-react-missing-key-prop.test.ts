import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxSource,
  openRedbox,
  getRedboxCallStack,
} from 'next-test-utils'

describe('app-dir - owner-stack-react-missing-key-prop', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: __dirname,
  })

  it('should catch invalid element from on rsc component', async () => {
    const browser = await next.browser('/rsc')
    await openRedbox(browser)

    const stackFramesContent = await getRedboxCallStack(browser)
    const source = await getRedboxSource(browser)

    if (isTurbopack) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
       [
         "span <anonymous>",
         "<anonymous> app/rsc/page.tsx (7:9)",
         "Array.map <anonymous>",
         "Page app/rsc/page.tsx (6:13)",
       ]
      `)
      expect(source).toMatchInlineSnapshot(`
         "app/rsc/page.tsx (7:9) @ <anonymous>

            5 |     <div>
            6 |       {list.map((item, index) => (
         >  7 |         <span>{item}</span>
              |         ^
            8 |       ))}
            9 |     </div>
           10 |   )"
        `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`
       [
         "span <anonymous>",
         "eval app/rsc/page.tsx (7:9)",
         "Array.map <anonymous>",
         "Page app/rsc/page.tsx (6:13)",
       ]
      `)
      expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.tsx (7:9) @ eval

             5 |     <div>
             6 |       {list.map((item, index) => (
          >  7 |         <span>{item}</span>
               |         ^
             8 |       ))}
             9 |     </div>
            10 |   )"
        `)
    }
  })

  it('should catch invalid element from on ssr client component', async () => {
    const browser = await next.browser('/ssr')
    await openRedbox(browser)

    const stackFramesContent = await getRedboxCallStack(browser)
    const source = await getRedboxSource(browser)
    if (isTurbopack) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
       [
         "p <anonymous>",
         "<unknown> app/ssr/page.tsx (9:9)",
         "Array.map <anonymous>",
         "Page app/ssr/page.tsx (8:13)",
       ]
      `)
      expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.tsx (9:9) @ <unknown>

             7 |     <div>
             8 |       {list.map((item, index) => (
          >  9 |         <p>{item}</p>
               |         ^
            10 |       ))}
            11 |     </div>
            12 |   )"
        `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`
       [
         "p <anonymous>",
         "eval app/ssr/page.tsx (9:9)",
         "Array.map <anonymous>",
         "Page app/ssr/page.tsx (8:13)",
       ]
      `)
      expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.tsx (9:9) @ eval

             7 |     <div>
             8 |       {list.map((item, index) => (
          >  9 |         <p>{item}</p>
               |         ^
            10 |       ))}
            11 |     </div>
            12 |   )"
        `)
    }
  })
})
