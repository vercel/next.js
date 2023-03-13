import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import path from 'path'

async function matchLogs(browser, includes: string) {
  let found = false

  const browserLogs = await browser.log('browser')

  browserLogs.forEach((log) => {
    if (log.message.includes(includes)) {
      found = true
    }
  })
  return found
}

const appDir = path.join(__dirname, 'app')

describe('New Link Behavior', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(appDir, 'pages')),
        'next.config.js': new FileRef(path.join(appDir, 'next.config.js')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should render link with <a>', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)
    const $a = $('a')
    expect($a.text()).toBe('About')
    expect($a.attr('href')).toBe('/about')
  })

  it('should navigate to /about', async () => {
    const browser = await webdriver(next.url, `/`)
    await browser.elementByCss('a').click().waitForElementByCss('#about-page')
    const text = await browser.elementByCss('h1').text()
    expect(text).toBe('About Page')
  })

  it('should handle onclick', async () => {
    const browser = await webdriver(next.url, `/onclick`)
    await browser.elementByCss('a').click().waitForElementByCss('h1')
    const text = await browser.elementByCss('h1').text()
    expect(text).toBe('Home Page')

    expect(await matchLogs(browser, 'link to home clicked')).toBe(true)
  })

  it('should handle preventdefault', async () => {
    const browser = await webdriver(next.url, `/onclick-prevent-default`)
    await browser.elementByCss('a').click()
    const text = await browser.elementByCss('h1').text()
    expect(text).toBe('Onclick prevent default')

    expect(await matchLogs(browser, 'link to home clicked but prevented')).toBe(
      true
    )
  })

  it('should render link with id', async () => {
    const html = await renderViaHTTP(next.url, '/id-pass-through')
    const $ = cheerio.load(html)
    const $a = $('a')
    expect($a.attr('id')).toBe('home-link')
  })

  it('should render link with classname', async () => {
    const html = await renderViaHTTP(next.url, '/classname-pass-through')
    const $ = cheerio.load(html)
    const $a = $('a')
    expect($a.attr('class')).toBe('home-link')
  })

  it('should render link with multiple children', async () => {
    const html = await renderViaHTTP(next.url, '/multiple-children')
    const $ = cheerio.load(html)
    const $a = $('a')
    expect($a.text()).toBe('About Additional Children')
    expect($a.find('strong').text()).toBe('Additional Children')
  })
})
