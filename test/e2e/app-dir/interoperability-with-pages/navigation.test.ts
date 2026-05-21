import { FileRef, nextTestSetup } from 'e2e-utils'
import webdriver from 'next-webdriver'

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
    const browser = await webdriver(next.url, '/app')
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
    const browser = await webdriver(next.url, '/pages')
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

  // TODO: re-enable after 404 transition bug is addressed
  if (!(global as any).isNextDeploy) {
    it('It should be able to navigate pages -> app and go back an forward', async () => {
      const browser = await webdriver(next.url, '/pages')
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
      const browser = await webdriver(next.url, '/app')
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
