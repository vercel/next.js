/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import cheerio from 'cheerio'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

const context = {}
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('No duplicate meta tags', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(context.appPort, '/')])
  })
  afterAll(() => killApp(context.server))

  async function get$ (path, query) {
    const html = await renderViaHTTP(context.appPort, path, query)
    return cheerio.load(html)
  }

  describe('Without key', () => {
    test('should render the right meta tag', async () => {
      const $ = await get$('/')
      let duplicate = false
      $('meta[charSet=utf-8]').each(function (i, elem) {
        if ($(this).attr('id') !== 'page-charSet') {
          duplicate = true
        }
      })
      expect(duplicate).toBe(false)
    })
  })
  describe('With key', () => {
    test('should render the right meta tag', async () => {
      const $ = await get$('/')
      let duplicate = false
      $('meta[name=viewport]').each(function (i, elem) {
        if ($(this).attr('id') !== 'page-viewport') {
          duplicate = true
        }
      })
      expect(duplicate).toBe(false)
    })
  })
})
