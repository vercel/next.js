import { createNext, FileRef } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { NextInstance } from 'e2e-utils'
import { join } from 'path'

describe('next/head', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        components: new FileRef(join(__dirname, 'app/components')),
      },
    })
  })
  afterAll(() => next.destroy())

  it(`should place charset element at the top of <head>`, async () => {
    const browser = await webdriver(next.url, '/')

    const html = await browser.eval(() => {
      const head = document.querySelector('head')
      return head.innerHTML
    })

    expect(html).toContain(
      `<meta charset="utf-8" data-next-head=""><meta name="viewport" content="width=device-width" data-next-head=""><meta name="test-head-1" content="hello" data-next-head="">`
    )
  })

  it('should have correct head tags in initial document', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    for (let i = 1; i < 5; i++) {
      expect($(`meta[name="test-head-${i}"]`).attr()['content']).toBe('hello')
    }
  })

  it('should have correct head tags from a fragment', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    expect($(`meta[name="test-in-fragment"]`).attr()['content']).toBe('hello')
  })

  it('should have correct head tags after hydration', async () => {
    const browser = await webdriver(next.url, '/')

    for (let i = 1; i < 5; i++) {
      expect(
        await browser
          .elementByCss(`meta[name="test-head-${i}"]`)
          .getAttribute('content')
      ).toBe('hello')
    }
  })

  it('should have current head tags from a _document getInitialProps', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    expect($(`meta[name="test-head-initial-props"]`).attr()['content']).toBe(
      'hello'
    )
  })

  it('should warn and ignore invalid head tags', async () => {
    const browser = await webdriver(next.url, '/invalid-head')

    await browser.waitForElementByCss('h1')

    const browserLogs = await browser.log()
    const warning = browserLogs.find(({ message }) =>
      message.includes('Do not use <html> in next/head')
    )

    expect(warning).toBeTruthy()
    expect(await browser.eval(() => document.title)).toBe('Invalid Head')
    expect(
      await browser.eval(() => document.head.querySelector('title')?.textContent)
    ).toBe('Invalid Head')
    expect(
      await browser.eval(() => document.body.querySelector('html'))
    ).toBeNull()
  })
})
