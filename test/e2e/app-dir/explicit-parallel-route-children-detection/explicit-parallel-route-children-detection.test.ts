import { nextTestSetup } from 'e2e-utils'

describe('explicit-parallel-route-children-detection', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not infer children from a layout-only descendant', async () => {
    const response = await next.fetch('/layout-only/anything')
    expect(response.status).toBe(200)

    const browser = await next.browser('/layout-only/anything')
    expect(await browser.elementById('layout-only-slot').text()).toBe(
      'layout-only slot'
    )
  })

  it('finds route targets nested beneath an ordinary children branch', async () => {
    // The sidebar matches, but the discovered children branch does not. This
    // route must be incomplete rather than rendering only the sidebar.
    const incompleteResponse = await next.fetch('/nested/incomplete')
    expect(await incompleteResponse.text()).toContain(
      'This page could not be found'
    )

    const browser = await next.browser('/nested/content/anything')
    expect(await browser.elementById('nested-sidebar').text()).toBe(
      'nested sidebar'
    )
    expect(await browser.elementById('nested-left').text()).toBe('nested left')
    expect(await browser.elementById('nested-right').text()).toBe(
      'nested right'
    )
  })
})
