/* eslint-env jest */
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Middleware base tests', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app/pages')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should execute from absolute paths', async () => {
    const browser = await webdriver(next.url, '/redirect-with-basepath')
    try {
      expect(await browser.eval(`window.location.pathname`)).toBe(
        '/root/redirect-with-basepath'
      )
    } finally {
      await browser.close()
    }

    const res = await fetchViaHTTP(next.url, '/root/redirect-with-basepath')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('About Page')
  })
  it('router.query must exist when Link clicked page routing', async () => {
    const browser = await webdriver(next.url, '/root')
    try {
      await browser.elementById('go-to-hello-world-anchor').click()
      const routeName = await browser.elementById('route-name').text()
      expect(routeName).toMatch('hello-world')
    } finally {
      await browser.close()
    }
  })
})
