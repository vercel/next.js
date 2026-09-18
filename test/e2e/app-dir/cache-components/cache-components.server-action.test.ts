import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox, retry } from 'next-test-utils'

describe('cache-components', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should not fail decoding server action arguments', async () => {
    const browser = await next.browser('/server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should not have cache components errors when encoding bound args for inline server actions', async () => {
    const browser = await next.browser('/server-action-inline')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    if (isNextDev) {
      await waitForNoRedbox(browser)
    }

    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(
        'result and more and even more'
      )
    })

    expect(next.cliOutput).not.toInclude('Error: Route "/server-action-inline"')
  })

  it('should prerender pages with inline server actions', async () => {
    let $ = await next.render$('/server-action-inline', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })

  it('uses fresh server data for an uncontrolled input without an action redirect', async () => {
    const browser = await next.browser('/server-action-uncontrolled-form')
    const initialTitle = await browser
      .elementByCss('[data-testid="post-title"]')
      .text()

    expect(
      await browser
        .elementByCss('[data-testid="inline-title-input"]')
        .getValue()
    ).toBe(initialTitle)
    await browser
      .locator('[data-testid="inline-title-input"]')
      .fill('Post 1 inline')
    await browser.locator('[data-testid="save-inline-post"]').click()

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe(
        '/server-action-uncontrolled-form'
      )
      expect(
        await browser.elementByCss('[data-testid="post-title"]').text()
      ).toBe('Post 1 inline')
      const input = browser.locator('[data-testid="inline-title-input"]')
      expect(await input.getAttribute('value')).toBe('Post 1 inline')
      expect(await input.inputValue()).toBe('Post 1 inline')
    })
  })

  it('uses fresh server data for an uncontrolled input after an action redirect', async () => {
    const browser = await next.browser('/server-action-uncontrolled-form')

    await browser
      .locator('a[href="/server-action-uncontrolled-form/edit"]')
      .click()

    expect(
      await browser.elementByCss('[data-testid="title-input"]').getValue()
    ).not.toBe('Post 1 v2')
    await browser.locator('[data-testid="title-input"]').fill('Post 1 v2')
    await browser.locator('[data-testid="save-post"]').click()

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe(
        '/server-action-uncontrolled-form'
      )
      expect(
        await browser.elementByCss('[data-testid="post-title"]').text()
      ).toBe('Post 1 v2')
    })

    await browser
      .locator('a[href="/server-action-uncontrolled-form/edit"]')
      .click()

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe(
        '/server-action-uncontrolled-form/edit'
      )
      expect(
        await browser.elementByCss('[data-testid="title-input"]').getValue()
      ).toBe('Post 1 v2')
    })
  })
})
