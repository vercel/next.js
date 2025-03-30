import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
} from 'next-test-utils'

describe('app dir - unauthorized with default unauthorized boundary', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // TODO: error unauthorized usage in root layout
  it.skip('should error on client unauthorized from root layout in browser', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#trigger-unauthorized').click()

    if (isNextDev) {
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        /unauthorized\(\) is not allowed to use in root layout/
      )
    }
  })

  // TODO: error unauthorized usage in root layout
  it.skip('should error on server unauthorized from root layout on server-side', async () => {
    const browser = await next.browser('/?root-unauthorized=1')

    if (isNextDev) {
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toBe(
        'Error: unauthorized() is not allowed to use in root layout'
      )
    }
  })

  it('should be able to navigate to page calling unauthorized', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#navigate-unauthorized').click()
    await browser.waitForElementByCss('.next-error-h1')

    expect(await browser.elementByCss('h1').text()).toBe('401')
    expect(await browser.elementByCss('h2').text()).toBe(
      `You're not authorized to access this page.`
    )
  })

  it('should be able to navigate to page with calling unauthorized in metadata', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#metadata-layout-unauthorized').click()
    await browser.waitForElementByCss('.next-error-h1')

    expect(await browser.elementByCss('h1').text()).toBe('401')
    expect(await browser.elementByCss('h2').text()).toBe(
      `You're not authorized to access this page.`
    )
  })

  it('should render default unauthorized for group routes if unauthorized is not defined', async () => {
    const browser = await next.browser('/group-dynamic/123')
    expect(await browser.elementByCss('#page').text()).toBe(
      'group-dynamic [id]'
    )

    await browser.loadPage(next.url + '/group-dynamic/401')
    await assertNoRedbox(browser)
    await browser.waitForElementByCss('.group-root-layout')
    expect(await browser.elementByCss('.next-error-h1').text()).toBe('401')
  })
})
