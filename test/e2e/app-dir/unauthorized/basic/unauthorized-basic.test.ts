import { nextTestSetup } from 'e2e-utils'

describe('app dir - unauthorized - basic', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should match dynamic route unauthorized boundary correctly', async () => {
    // `/dynamic` display works
    const browserDynamic = await next.browser('/dynamic')
    expect(await browserDynamic.elementByCss('main').text()).toBe('dynamic')

    // `/dynamic/401` calling unauthorized() will match the same level unauthorized boundary
    const browserError = await next.browser('/dynamic/401')
    expect(await browserError.elementByCss('#unauthorized').text()).toBe(
      'dynamic/[id] unauthorized'
    )

    const browserDynamicId = await next.browser('/dynamic/123')
    expect(await browserDynamicId.elementByCss('#page').text()).toBe(
      'dynamic [id]'
    )
  })

  it('should escalate unauthorized to parent layout if no unauthorized boundary present in current layer', async () => {
    const browserDynamic = await next.browser(
      '/dynamic-layout-without-unauthorized'
    )
    expect(await browserDynamic.elementByCss('h1').text()).toBe(
      'Dynamic with Layout'
    )

    // no unauthorized boundary in /dynamic-layout-without-unauthorized, escalate to parent layout to render root unauthorized
    const browserDynamicId = await next.browser(
      '/dynamic-layout-without-unauthorized/401'
    )
    expect(await browserDynamicId.elementByCss('h1').text()).toBe(
      'Root Unauthorized'
    )
  })

  it('should escalate unauthorized past a group route layout to render root unauthorized', async () => {
    const browserDynamicId = await next.browser('/group-dynamic/123')
    expect(await browserDynamicId.elementByCss('#page').text()).toBe(
      'group-dynamic [id]'
    )
    expect(
      await browserDynamicId.hasElementByCssSelector('#group-layout')
    ).toBe(true)

    // no unauthorized boundary in the group route, escalate to the root boundary
    // instead of rendering it inside the group route's layout
    const browserUnauthorized = await next.browser('/group-dynamic/401')
    expect(await browserUnauthorized.elementByCss('h1').text()).toBe(
      'Root Unauthorized'
    )
    expect(
      await browserUnauthorized.hasElementByCssSelector('#group-layout')
    ).toBe(false)
  })
})
