import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'dev-static-indicator-searchparams',
  {
    files: {
      'app/page.tsx': `
        export default async function Page({
          searchParams,
        }: {
          searchParams: Promise<{ a: string }>
        }) {
          const sp = await searchParams
          return (
            <div>
              <p id="sp-val">sp: {sp.a}</p>
            </div>
          )
        }
      `,
    },
  },
  ({ next }) => {
    it('should not show static indicator when searchParams are accessed', async () => {
      const browser = await next.browser('/?a=test')
      
      await check(
        () => browser.elementByCss('#sp-val').text(),
        'sp: test'
      )
      
      // The static indicator is rendered with data-testid="static-indicator"
      // If it's a dynamic page (due to searchParams), it should NOT be present or should have dynamic icon.
      const hasStaticIndicator = await browser.hasElementByCssSelector('[data-nextjs-dev-indicator="static"]')
      expect(hasStaticIndicator).toBe(false)
    })
  }
)