import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('back/forward cache', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('React state is preserved when navigating with back/forward buttons', async () => {
    const browser = await next.browser('/page/1')

    // Accumulate some state on page 1.
    await retry(async () => {
      // we do this inside of retry in case button event handler
      // isn't ready yet
      await browser.elementById('increment-button-1').click()

      const counterDisplay1 = await browser.elementById('counter-display-1')
      expect(await counterDisplay1.text()).toBe('Count: 1')
    })
    await browser.elementById('increment-button-1').click()

    const counterDisplay1 = await browser.elementById('counter-display-1')
    expect(await counterDisplay1.text()).toBe('Count: 2')

    // Navigate to page 2. Accumulate some state here, too.
    const linkToPage2 = await browser.elementByCss('a[href="/page/2"]')
    await linkToPage2.click()
    const incrementButton2 = await browser.elementById('increment-button-2')
    const counterDisplay2 = await browser.elementById('counter-display-2')
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    expect(await counterDisplay2.text()).toBe('Count: 9')

    // Navigate back to page 1. Its state should be preserved.
    await browser.back()
    const counterDisplay1AfterNav =
      await browser.elementById('counter-display-1')
    expect(await counterDisplay1AfterNav.text()).toBe('Count: 2')

    // Navigate forward to page 2. Its state should be preserved.
    await browser.forward()
    const counterDisplay2AfterNav =
      await browser.elementById('counter-display-2')
    expect(await counterDisplay2AfterNav.text()).toBe('Count: 9')
  })

  it('React state is preserved when navigating back/forward with links', async () => {
    const browser = await next.browser('/page/1')

    // Accumulate some state on page 1.
    // Accumulate some state on page 1.
    await retry(async () => {
      // we do this inside of retry in case button event handler
      // isn't ready yet
      await browser.elementById('increment-button-1').click()

      const counterDisplay1 = await browser.elementById('counter-display-1')
      expect(await counterDisplay1.text()).toBe('Count: 1')
    })
    await browser.elementById('increment-button-1').click()

    const counterDisplay1 = await browser.elementById('counter-display-1')
    expect(await counterDisplay1.text()).toBe('Count: 2')

    // Navigate to page 2. Accumulate some state here, too.
    const linkToPage2 = await browser.elementByCss('a[href="/page/2"]')
    await linkToPage2.click()
    const incrementButton2 = await browser.elementById('increment-button-2')
    const counterDisplay2 = await browser.elementById('counter-display-2')
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    expect(await counterDisplay2.text()).toBe('Count: 9')

    // Navigate back to page 1. Its state should be preserved.
    const linkToPage1 = await browser.elementByCss('a[href="/page/1"]')
    await linkToPage1.click()
    const counterDisplay1AfterNav =
      await browser.elementById('counter-display-1')
    expect(await counterDisplay1AfterNav.text()).toBe('Count: 2')

    // Navigate back to page 2. Its state should be preserved.
    await linkToPage2.click()
    const counterDisplay2AfterNav =
      await browser.elementById('counter-display-2')
    expect(await counterDisplay2AfterNav.text()).toBe('Count: 9')
  })

  // FIXME: Flaky test: https://vercel.slack.com/archives/C07CJPHL49E/p1758009379720479
  it.skip('React state is preserved when navigating back to a page with different search params than before ', async () => {
    const browser = await next.browser('/page/1')

    // Accumulate some state on page 1.
    await retry(async () => {
      // we do this inside of retry in case button event handler
      // isn't ready yet
      await browser.elementById('increment-button-1').click()

      const counterDisplay1 = await browser.elementById('counter-display-1')
      expect(await counterDisplay1.text()).toBe('Count: 1')
    })
    await browser.elementById('increment-button-1').click()

    const counterDisplay1 = await browser.elementById('counter-display-1')
    expect(await counterDisplay1.text()).toBe('Count: 2')

    // Navigate to page 2.
    const linkToPage2 = await browser.elementByCss('a[href="/page/2"]')
    await linkToPage2.click()

    // Navigate back to page 1, but with a different search param.
    const linkToPage1WithSearchParam = await browser.elementByCss(
      'a[href="/page/1?param=true"]'
    )
    await linkToPage1WithSearchParam.click()

    await retry(async () => {
      const counterDisplay1AfterNav =
        await browser.elementById('counter-display-1')
      const hasSearchParam = await browser.elementById('has-search-param-1')
      expect(await counterDisplay1AfterNav.text()).toBe('Count: 2')
      expect(await hasSearchParam.text()).toBe('Has search param: yes')
    })
  })

  it('bfcache only preserves up to N entries', async () => {
    // The current limit is hardcoded to 3.
    const browser = await next.browser('/page/1')
    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toEqual('Page 1')
    })

    // Accumulate some state on page 1.
    await retry(async () => {
      // we do this inside of retry in case button event handler
      // isn't ready yet
      await browser.elementById('increment-button-1').click()

      const counterDisplay1 = await browser.elementById('counter-display-1')
      expect(await counterDisplay1.text()).toBe('Count: 1')
    })
    await browser.elementById('increment-button-1').click()

    const counterDisplay1 = await browser.elementById('counter-display-1')
    expect(await counterDisplay1.text()).toBe('Count: 2')

    // Navigate to page 2. Accumulate some state here, too.
    const linkToPage2 = await browser.elementByCss('a[href="/page/2"]')
    await linkToPage2.click()
    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toEqual('Page 2')
    })

    const incrementButton2 = await browser.elementById('increment-button-2')
    const counterDisplay2 = await browser.elementById('counter-display-2')
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    expect(await counterDisplay2.text()).toBe('Count: 9')

    // Navigate to 2 additional pages.
    const linkToPage3 = await browser.elementByCss('a[href="/page/3"]')
    await linkToPage3.click()
    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toEqual('Page 3')
    })
    const linkToPage4 = await browser.elementByCss('a[href="/page/4"]')
    await linkToPage4.click()
    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toEqual('Page 4')
    })

    // The bfcache size is now 4. Because the limit is 3, page 1 should have
    // been evicted, but not page 2.

    // Navigate to page 2 to confirm its state is preserved.
    await linkToPage2.click()
    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toEqual('Page 2')
    })
    const counterDisplay2AfterNav =
      await browser.elementById('counter-display-2')
    expect(await counterDisplay2AfterNav.text()).toBe('Count: 9')

    // Navigate back to page 1 to confirm its state is not preserved.
    const linkToPage1 = await browser.elementByCss('a[href="/page/1"]')
    await linkToPage1.click()
    await retry(async () => {
      expect(await browser.elementByCss('h2').text()).toEqual('Page 1')
    })

    const counterDisplay1AfterNav =
      await browser.elementById('counter-display-1')
    expect(await counterDisplay1AfterNav.text()).toBe('Count: 0')
  })

  it('navigate back and forth repeatedly between the same pages without evicting', async () => {
    // The current limit is hardcoded to 3.
    const browser = await next.browser('/page/1')

    // Accumulate some state on page 1.
    await retry(async () => {
      // we do this inside of retry in case button event handler
      // isn't ready yet
      await browser.elementById('increment-button-1').click()

      const counterDisplay1 = await browser.elementById('counter-display-1')
      expect(await counterDisplay1.text()).toBe('Count: 1')
    })
    await browser.elementById('increment-button-1').click()

    const counterDisplay1 = await browser.elementById('counter-display-1')
    expect(await counterDisplay1.text()).toBe('Count: 2')

    // Navigate to page 2. Accumulate some state here, too.
    const linkToPage2 = await browser.elementByCss('a[href="/page/2"]')
    await linkToPage2.click()
    const incrementButton2 = await browser.elementById('increment-button-2')
    const counterDisplay2 = await browser.elementById('counter-display-2')
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    await incrementButton2.click()
    expect(await counterDisplay2.text()).toBe('Count: 9')

    // Navigate between pages 1 and 2 repeatedly
    const linkToPage1 = await browser.elementByCss('a[href="/page/1"]')
    await linkToPage1.click()
    await linkToPage2.click()
    await linkToPage1.click()
    await linkToPage2.click()
    await linkToPage1.click()
    await linkToPage2.click()

    // Confirm the state is preserved on both pages.
    const counterDisplay2AfterNav =
      await browser.elementById('counter-display-2')
    expect(await counterDisplay2AfterNav.text()).toBe('Count: 9')

    await linkToPage1.click()
    const counterDisplay1AfterNav =
      await browser.elementById('counter-display-1')
    expect(await counterDisplay1AfterNav.text()).toBe('Count: 2')
  })
})
