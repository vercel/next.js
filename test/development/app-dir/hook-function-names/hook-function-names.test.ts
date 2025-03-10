import { nextTestSetup } from 'e2e-utils'

describe('hook-function-names', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show readable hook names in stacks', async () => {
    const browser = await next.browser('/button')

    await browser.elementByCss('button').click()

    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "count": 1,
       "description": "Error: Kaputt!",
       "environmentLabel": null,
       "label": "Unhandled Runtime Error",
       "source": "app/button/page.tsx (7:11) @ Button.useCallback[handleClick]
     >  7 |     throw new Error(message)
          |           ^",
       "stack": [
         "Button.useCallback[handleClick] app/button/page.tsx (7:11)",
         "button <anonymous> (0:0)",
         "Button app/button/page.tsx (11:5)",
         "Page app/button/page.tsx (18:10)",
       ],
     }
    `)
  })

  it('should show readable hook names in stacks for default-exported components', async () => {
    const browser = await next.browser('/')

    await expect(browser).toDisplayRedbox(`
     {
       "count": 1,
       "description": "Error: error in useEffect",
       "environmentLabel": null,
       "label": "Unhandled Runtime Error",
       "source": "app/page.tsx (7:11) @ Page.useEffect
     >  7 |     throw new Error('error in useEffect')
          |           ^",
       "stack": [
         "Page.useEffect app/page.tsx (7:11)",
       ],
     }
    `)
  })
})
