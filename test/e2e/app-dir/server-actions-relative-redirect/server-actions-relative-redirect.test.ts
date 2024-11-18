import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-actions-relative-redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with relative redirect', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#relative-redirect').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
        'hello nested page'
      )
    })
  })

  it('should work with absolute redirect', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#absolute-redirect').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
        'hello nested page'
      )
    })
  })

  it('should work with relative redirect from subdir', async () => {
    const browser = await next.browser('/subdir')
    await browser.waitForElementByCss('#relative-subdir-redirect').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
        'hello subdir nested page'
      )
    })
  })

  it('should work with absolute redirect from subdir', async () => {
    const browser = await next.browser('/subdir')
    await browser.waitForElementByCss('#absolute-subdir-redirect').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
        'hello nested page'
      )
    })
  })

  it('should work with multi-level relative redirect from subdir', async () => {
    const browser = await next.browser('/subdir')
    await browser.eval('window.notReloaded = true')
    await browser.waitForElementByCss('#multi-relative-subdir-redirect').click()

    await retry(async () => {
      expect(await browser.waitForElementByCss('#page-loaded').text()).toBe(
        'hello nested page'
      )
    })

    expect(await browser.eval('window.notReloaded')).toBe(true)
  })
})
