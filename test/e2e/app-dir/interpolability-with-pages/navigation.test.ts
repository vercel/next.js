import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('navigation between pages and app dir', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(__dirname),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('It should be able to navigate app -> pages', async () => {
    const browser = await webdriver(next.url, '/app')
    expect(await browser.elementById('app-page').text()).toBe('App Page')
    browser.elementById('link-to-pages').click()
    await browser.waitForElementByCss('#pages-page')
    expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
  })

  it('It should be able to navigate pages -> app', async () => {
    const browser = await webdriver(next.url, '/pages')
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
    browser.elementById('link-to-app').click()
    await browser.waitForElementByCss('#app-page')
    expect(await browser.hasElementByCssSelector('#pages-page')).toBeFalse()
    expect(await browser.elementById('app-page').text()).toBe('App Page')
  })

  it('It should be able to navigate pages -> app and go back an forward', async () => {
    const browser = await webdriver(next.url, '/pages')
    browser.elementById('link-to-app').click()
    await browser.waitForElementByCss('#app-page')
    browser.back()
    await browser.waitForElementByCss('#pages-page')
    expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
    browser.forward()
    await browser.waitForElementByCss('#app-page')
    expect(await browser.hasElementByCssSelector('#pages-page')).toBeFalse()
    expect(await browser.elementById('app-page').text()).toBe('App Page')
  })

  it('It should be able to navigate app -> pages and go back and forward', async () => {
    const browser = await webdriver(next.url, '/app')
    browser.elementById('link-to-pages').click()
    await browser.waitForElementByCss('#pages-page')
    browser.back()
    await browser.waitForElementByCss('#app-page')
    expect(await browser.hasElementByCssSelector('#pages-page')).toBeFalse()
    expect(await browser.elementById('app-page').text()).toBe('App Page')
    browser.forward()
    await browser.waitForElementByCss('#pages-page')
    expect(await browser.hasElementByCssSelector('#app-page')).toBeFalse()
    expect(await browser.elementById('pages-page').text()).toBe('Pages Page')
  })
})
