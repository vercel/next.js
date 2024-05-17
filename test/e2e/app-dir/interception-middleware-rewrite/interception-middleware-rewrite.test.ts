import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('interception-middleware-rewrite', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // TODO: remove after deployment handling is updated
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should support intercepting routes with a middleware rewrite', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.waitForElementByCss('#children').text()).toEqual(
        'root'
      )
    })

    await retry(async () => {
      expect(
        await browser
          .elementByCss('[href="/feed"]')
          .click()
          .waitForElementByCss('#modal')
          .text()
      ).toEqual('intercepted')
    })

    await retry(async () => {
      expect(
        await browser.refresh().waitForElementByCss('#children').text()
      ).toEqual('not intercepted')
    })

    await retry(async () => {
      expect(await browser.waitForElementByCss('#modal').text()).toEqual('')
    })
  })

  it('should continue to work after using browser back button and following another intercepting route', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementById('children').text()).toEqual('root')
    })

    await browser.elementByCss('[href="/photos/1"]').click()
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual(
        'Intercepted Photo ID: 1'
      )
    })
    await browser.back()
    await browser.elementByCss('[href="/photos/2"]').click()
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual(
        'Intercepted Photo ID: 2'
      )
    })
  })

  it('should continue to show the intercepted page when revisiting it', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementById('children').text()).toEqual('root')
    })

    await browser.elementByCss('[href="/photos/1"]').click()

    // we should be showing the modal and not the page
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual(
        'Intercepted Photo ID: 1'
      )
    })

    await browser.refresh()

    // page should show after reloading the browser
    await retry(async () => {
      expect(await browser.elementById('children').text()).toEqual(
        'Page Photo ID: 1'
      )
    })

    // modal should no longer be showing
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual('')
    })

    await browser.back()

    // revisit the same page that was intercepted
    await browser.elementByCss('[href="/photos/1"]').click()

    // ensure that we're still showing the modal and not the page
    await retry(async () => {
      expect(await browser.elementById('modal').text()).toEqual(
        'Intercepted Photo ID: 1'
      )
    })

    // page content should not have changed
    await retry(async () => {
      expect(await browser.elementById('children').text()).toEqual('root')
    })
  })
})
