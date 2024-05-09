import { nextTestSetup } from 'e2e-utils'
import { check, getRedboxDescription, hasRedbox } from 'next-test-utils'

describe('forbidden-default', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should error on client forbidden from root layout in browser', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#trigger-forbidden').click()

    if (isNextDev) {
      await check(async () => {
        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxDescription(browser)).toMatch(
          /forbidden\(\) is not allowed to use in root layout/
        )
        return 'success'
      }, /success/)
    }
  })

  it('should error on server forbidden from root layout on server-side', async () => {
    const browser = await next.browser('/?root-forbidden=1')

    if (isNextDev) {
      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxDescription(browser)).toBe(
        'Error: forbidden() is not allowed to use in root layout'
      )
    }
  })

  it('should be able to navigate to page calling forbidden', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#navigate-forbidden').click()
    await browser.waitForElementByCss('.next-error-h1')

    expect(await browser.elementByCss('h1').text()).toBe('403')
    expect(await browser.elementByCss('h2').text()).toBe(
      'This page is forbidden.'
    )
  })

  it('should be able to navigate to page with calling forbidden in metadata', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#metadata-layout-forbidden').click()
    await browser.waitForElementByCss('.next-error-h1')

    expect(await browser.elementByCss('h1').text()).toBe('403')
    expect(await browser.elementByCss('h2').text()).toBe(
      'This page is forbidden.'
    )
  })

  it('should render default forbidden for group routes if forbidden is not defined', async () => {
    const browser = await next.browser('/group-dynamic/123')
    expect(await browser.elementByCss('#page').text()).toBe(
      'group-dynamic [id]'
    )

    await browser.loadPage(next.url + '/group-dynamic/403')
    expect(await browser.elementByCss('.next-error-h1').text()).toBe('403')
    expect(await browser.elementByCss('html').getAttribute('class')).toBe(
      'group-root-layout'
    )
  })
})
