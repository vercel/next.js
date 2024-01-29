import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'parallel-routes-and-interception',
  {
    files: __dirname,
    // TODO: remove after deployment handling is updated
    skipDeployment: true,
  },
  ({ next }) => {
    // TODO: revisit the error for missing parallel routes slot
    it('should not render the @children slot when the @slot is not found', async () => {
      const browser = await next.browser('/')
      // we make sure the page is available through navigating
      expect(await browser.elementByCss('body').text()).toMatch(
        /This page could not be found/
      )

      // we also check that the #children-slot id is not present
      expect(await browser.hasElementByCssSelector('#children-slot')).toBe(
        false
      )
    })
  }
)
