import { nextTestSetup } from 'e2e-utils'
import {
  getRedboxSource,
  openRedbox,
  getStackFramesContent,
} from 'next-test-utils'

describe('app-dir - owner-stack-react-missing-key-prop', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should catch invalid element from on rsc component', async () => {
    const browser = await next.browser('/rsc')
    await openRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    const source = await getRedboxSource(browser)

    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
         "at span ()
         at <anonymous> (app/rsc/page.tsx (7:10))
         at Page (app/rsc/page.tsx (6:13))"
        `)
      expect(source).toMatchInlineSnapshot(`
         "app/rsc/page.tsx (7:10) @ <anonymous>

            5 |     <div>
            6 |       {list.map((item, index) => (
         >  7 |         <span>{item}</span>
              |          ^
            8 |       ))}
            9 |     </div>
           10 |   )"
        `)
    } else {
      expect(stackFramesContent).toMatchInlineSnapshot(`
         "at span ()
         at eval (app/rsc/page.tsx (7:10))
         at Page (app/rsc/page.tsx (6:13))"
        `)
      expect(source).toMatchInlineSnapshot(`
          "app/rsc/page.tsx (7:10) @ eval

             5 |     <div>
             6 |       {list.map((item, index) => (
          >  7 |         <span>{item}</span>
               |          ^
             8 |       ))}
             9 |     </div>
            10 |   )"
        `)
    }
  })

  it('should catch invalid element from on ssr client component', async () => {
    const browser = await next.browser('/ssr')
    await openRedbox(browser)

    const stackFramesContent = await getStackFramesContent(browser)
    const source = await getRedboxSource(browser)
    if (process.env.TURBOPACK) {
      expect(stackFramesContent).toMatchInlineSnapshot(`
         "at p ()
         at <unknown> (app/ssr/page.tsx (9:9))
         at Array.map ()
         at Page (app/ssr/page.tsx (8:13))"
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
         "at p ()
         at eval (app/ssr/page.tsx (9:10))
         at Array.map ()
         at Page (app/ssr/page.tsx (8:13))"
        `)
      expect(source).toMatchInlineSnapshot(`
          "app/ssr/page.tsx (9:10) @ eval

             7 |     <div>
             8 |       {list.map((item, index) => (
          >  9 |         <p>{item}</p>
               |          ^
            10 |       ))}
            11 |     </div>
            12 |   )"
        `)
    }
  })
})
