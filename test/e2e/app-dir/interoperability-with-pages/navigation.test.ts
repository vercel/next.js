import { FileRef, nextTestSetup } from 'e2e-utils'

describe('navigation between pages and app dir', () => {
  const { next } = nextTestSetup({
    files: new FileRef(__dirname),
    dependencies: {
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  })

  it('It should be able to navigate app -> pages', async () => {
    const browser = await next.browser('/app')
    expect(await browser.elementById('app-page').text()).toBe('App Page')
    // Increased timeout: in dev mode, cross-router navigation triggers on-demand
    // compilation which can take longer than the default timeout.
    await browser
      .elementById('link-to-pages')
      .click()
      .waitForElementByCss('#pages-page', { timeout: 30000 })
    expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
  })

  it('It should be able to navigate pages -> app', async () => {
    const browser = await next.browser('/pages')
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
    // Increased timeout: in dev mode, cross-router navigation triggers on-demand
    // compilation which can take longer than the default timeout.
    await browser
      .elementById('link-to-app')
      .click()
      .waitForElementByCss('#app-page', { timeout: 30000 })
    expect(await browser.hasElementByCssSelector('#pages-page')).toBeFalse()
    expect(await browser.elementById('app-page').text()).toBe('App Page')
  })

  // The client router filter only records the static prefix before a dynamic
  // segment. `/[locale]/about` has no static prefix, and recording `/` would
  // make every route a possible App Router route. The Pages Router therefore
  // handles this client navigation and matches `/[locale]/[category]`.
  it('should use a dynamic pages route when the app route has no static prefix', async () => {
    const browser = await next.browser('/en/some-page')

    expect(await browser.elementByCss('#pages-some-page h1').text()).toBe(
      'Pages Router Some Page'
    )

    await browser
      .elementById('link-to-app-about')
      .click()
      .waitForElementByCss('#pages-category-page', { timeout: 30000 })

    expect(new URL(await browser.url()).pathname).toBe('/en/about')
    expect(await browser.hasElementByCssSelector('#app-about-page')).toBeFalse()
    expect(
      await browser.hasElementByCssSelector('#pages-category-page')
    ).toBeTrue()
  })

  // TODO: re-enable after 404 transition bug is addressed
  if (!(global as any).isNextDeploy) {
    it('It should be able to navigate pages -> app and go back an forward', async () => {
      const browser = await next.browser('/pages')
      // Increased timeout: in dev mode, cross-router navigation triggers on-demand
      // compilation which can take longer than the default timeout.
      await browser
        .elementById('link-to-app')
        .click()
        .waitForElementByCss('#app-page', { timeout: 30000 })
      await browser
        .back()
        .waitForElementByCss('#pages-page', { timeout: 30000 })
      expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
      expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
      await browser
        .forward()
        .waitForElementByCss('#app-page', { timeout: 30000 })
      expect(await browser.hasElementByCssSelector('#pages-page')).toBeFalse()
      expect(await browser.elementById('app-page').text()).toBe('App Page')
    })

    it('It should be able to navigate app -> pages and go back and forward', async () => {
      const browser = await next.browser('/app')
      // Increased timeout: in dev mode, cross-router navigation triggers on-demand
      // compilation which can take longer than the default timeout.
      await browser
        .elementById('link-to-pages')
        .click()
        .waitForElementByCss('#pages-page', { timeout: 30000 })
      await browser.back().waitForElementByCss('#app-page', { timeout: 30000 })
      expect(await browser.hasElementByCssSelector('#pages-page')).toBeFalse()
      expect(await browser.elementById('app-page').text()).toBe('App Page')
      await browser
        .forward()
        .waitForElementByCss('#pages-page', { timeout: 30000 })
      expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
      expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
    })
  }
})
