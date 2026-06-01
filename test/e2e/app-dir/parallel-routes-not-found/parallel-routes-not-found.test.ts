import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('parallel-routes-and-interception', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // TODO: remove after deployment handling is updated
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // TODO: revisit the error for missing parallel routes slot
  it('should not render the @children slot when the @slot is not found', async () => {
    const browser = await next.browser('/')
    // we make sure the page is available through navigating
    expect(await browser.elementByCss('body').text()).toMatch(
      /This page could not be found/
    )

    // we also check that the #children-slot id is not present
    expect(await browser.hasElementByCssSelector('#children-slot')).toBe(false)
    await retry(async () => {
      const title = await browser.eval(() => {
        return document.title
      })

      // TODO: the fact that the title on the client (in hydration data) disagrees with the title SSRd
      // when cache components is off is a sign we don't have coherent handling of notFound titles
      // This test now asserts the prod client title in next start that would actually be observed
      // by site visitors post hydration.
      expect(title).toBe('404: This page could not be found.')
    })
  })

  it('should render the title once for the non-existed route', async () => {
    const browser = await next.browser('/non-existed')
    const titles = await browser.elementsByCss('title')

    // FIXME: (metadata), the title should only be rendered once and using the not-found title
    expect(titles).toHaveLength(3)
  })
})
