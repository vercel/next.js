import { nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  getRedboxDescription,
} from 'next-test-utils'

describe('app dir - not found with default 404 page', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error on client notFound from root layout in browser', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#trigger-not-found').click()

    if (isNextDev) {
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toMatch(
        /notFound\(\) is not allowed to use in root layout/
      )
    }
  })

  it('should render default 404 with root layout for non-existent page', async () => {
    const browser = await next.browser('/non-existent')
    await browser.waitForElementByCss('.next-error-h1')
    expect(await browser.elementByCss('.next-error-h1').text()).toBe('404')
    expect(await browser.elementByCss('html').getAttribute('class')).toBe(
      'root-layout-html'
    )
  })

  it('should return 404 status code for default not-found page', async () => {
    const res = await next.fetch('/_not-found')
    expect(res.status).toBe(404)
  })

  it('should error on server notFound from root layout on server-side', async () => {
    const browser = await next.browser('/?root-not-found=1')

    if (isNextDev) {
      await assertHasRedbox(browser)
      expect(await getRedboxDescription(browser)).toBe(
        'Error: notFound() is not allowed to use in root layout'
      )
    }
  })

  it('should be able to navigate to page calling not-found', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#navigate-not-found').click()
    await browser.waitForElementByCss('.next-error-h1')

    expect(await browser.elementByCss('h1').text()).toBe('404')
    expect(await browser.elementByCss('h2').text()).toBe(
      'This page could not be found.'
    )
  })

  it('should be able to navigate to page with calling not-found in metadata', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#metadata-layout-not-found').click()
    await browser.waitForElementByCss('.next-error-h1')

    expect(await browser.elementByCss('h1').text()).toBe('404')
    expect(await browser.elementByCss('h2').text()).toBe(
      'This page could not be found.'
    )
  })

  it('should render default not found for group routes if not found is not defined', async () => {
    const browser = await next.browser('/group-dynamic/123')
    expect(await browser.elementByCss('#page').text()).toBe(
      'group-dynamic [id]'
    )

    await browser.loadPage(next.url + '/group-dynamic/404')
    await assertNoRedbox(browser)
    await browser.waitForElementByCss('.group-root-layout')
    expect(await browser.elementByCss('.next-error-h1').text()).toBe('404')
  })
})
