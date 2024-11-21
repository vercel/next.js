import { nextTestSetup } from 'e2e-utils'
import { assertHasRedbox, getRedboxSource, openRedbox } from 'next-test-utils'

describe('hook-function-names', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('should show readable hook names in stacks', async () => {
    const browser = await next.browser('/button')

    await browser.elementByCss('button').click()

    await openRedbox(browser)

    if (isTurbopack) {
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "app/button/page.tsx (7:11) @ Button.useCallback[handleClick]

           5 | const Button = ({ message }: { message: string }) => {
           6 |   const handleClick = useCallback(() => {
        >  7 |     throw new Error(message)
             |           ^
           8 |   }, [message])
           9 |
          10 |   return ("
      `)
    } else {
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
            "app/button/page.tsx (7:11) @ Button.useCallback[handleClick]

               5 | const Button = ({ message }: { message: string }) => {
               6 |   const handleClick = useCallback(() => {
            >  7 |     throw new Error(message)
                 |           ^
               8 |   }, [message])
               9 |
              10 |   return ("
        `)
    }
  })

  it('should show readable hook names in stacks for default-exported components', async () => {
    const browser = await next.browser('/')

    await assertHasRedbox(browser)

    if (isTurbopack) {
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
        "app/page.tsx (7:11) @ Page.useEffect

           5 | export default function Page() {
           6 |   useEffect(() => {
        >  7 |     throw new Error('error in useEffect')
             |           ^
           8 |   }, [])
           9 |
          10 |   return <p>Hello world!</p>"
      `)
    } else {
      expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
              "app/page.tsx (7:11) @ Page.useEffect

                 5 | export default function Page() {
                 6 |   useEffect(() => {
              >  7 |     throw new Error('error in useEffect')
                   |           ^
                 8 |   }, [])
                 9 |
                10 |   return <p>Hello world!</p>"
          `)
    }
  })
})
