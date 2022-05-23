import { createNext, FileRef } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'
import { join } from 'path'

describe('should set-up next', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
        components: new FileRef(join(__dirname, 'app/components')),
      },
      dependencies: {
        react: '17',
        'react-dom': '17',
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
      `<meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="test-head-1" content="hello">`
    )
  })

  it('should have correct head tags in initial document', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)

    for (let i = 1; i < 5; i++) {
      expect($(`meta[name="test-head-${i}"]`).attr()['content']).toBe('hello')
    }
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
})
