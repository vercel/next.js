import { createNextDescribe } from 'e2e-utils'
import { BrowserInterface } from 'test/lib/browsers/base'

createNextDescribe(
  'app dir - metadata',
  {
    files: __dirname,
  },
  ({ next, isNextDeploy }) => {
    describe('metadata', () => {
      if (isNextDeploy) {
        it('should skip for deploy currently', () => {})
        return
      }

      const getTitle = (browser: BrowserInterface) =>
        browser.elementByCss('title').text()

      async function queryMetaProps(
        browser: BrowserInterface,
        tag: string,
        query: string,
        selectedKeys: string[]
      ) {
        return await browser.eval(`
          const res = {}
          const el = document.querySelector('${tag}[${query}]')
          for (const k of ${JSON.stringify(selectedKeys)}) {
            res[k] = el?.getAttribute(k)
          }
          res`)
      }

      async function checkMeta(
        browser: BrowserInterface,
        name: string,
        content: string | string[],
        property: string = 'property',
        tag: string = 'meta',
        field: string = 'content'
      ) {
        const values = await browser.eval(
          `[...document.querySelectorAll('${tag}[${property}="${name}"]')].map((el) => el.getAttribute("${field}"))`
        )
        if (Array.isArray(content)) {
          expect(values).toEqual(content)
        } else {
          expect(values[0]).toBe(content)
        }
      }

      const checkMetaPropertyContentPair = (
        browser: BrowserInterface,
        name: string,
        content: string | string[]
      ) => checkMeta(browser, name, content, 'property')
      const checkMetaNameContentPair = (
        browser: BrowserInterface,
        name: string,
        content: string | string[]
      ) => checkMeta(browser, name, content, 'name')

      const checkLink = (
        browser: BrowserInterface,
        name: string,
        content: string | string[]
      ) => checkMeta(browser, name, content, 'rel', 'link', 'href')

      describe('basic', () => {
        it('should support title and description', async () => {
          const browser = await next.browser('/title')
          expect(await browser.eval(`document.title`)).toBe(
            'this is the page title'
          )
          await checkMetaNameContentPair(
            browser,
            'description',
            'this is the layout description'
          )
        })

        it('should support title template', async () => {
          const browser = await next.browser('/title-template')
          expect(await browser.eval(`document.title`)).toBe('Page | Layout')
        })

        it('should support stashed title in one layer of page and layout', async () => {
          const browser = await next.browser('/title-template/extra')
          expect(await browser.eval(`document.title`)).toBe(
            'Extra Page | Extra Layout'
          )
        })

        it('should support stashed title in two layers of page and layout', async () => {
          const browser = await next.browser('/title-template/extra/inner')
          expect(await browser.eval(`document.title`)).toBe(
            'Inner Page | Extra Layout'
          )
        })

        it('should support other basic tags', async () => {
          const browser = await next.browser('/basic')
          await checkMetaNameContentPair(browser, 'generator', 'next.js')
          await checkMetaNameContentPair(browser, 'application-name', 'test')
          await checkMetaNameContentPair(
            browser,
            'referrer',
            'origin-when-crossorigin'
          )
          await checkMetaNameContentPair(
            browser,
            'keywords',
            'next.js,react,javascript'
          )
          await checkMetaNameContentPair(browser, 'author', 'John Doe,Jane Doe')
          await checkMetaNameContentPair(browser, 'theme-color', 'cyan')
          await checkMetaNameContentPair(browser, 'color-scheme', 'dark')
          await checkMetaNameContentPair(
            browser,
            'viewport',
            'width=device-width, initial-scale=1, shrink-to-fit=no'
          )
          await checkMetaNameContentPair(browser, 'creator', 'shu')
          await checkMetaNameContentPair(browser, 'publisher', 'vercel')
          await checkMetaNameContentPair(browser, 'robots', 'index, follow')

          await checkMetaNameContentPair(
            browser,
            'format-detection',
            'telephone=no, address=no, email=no'
          )
        })

        it('should support object viewport', async () => {
          const browser = await next.browser('/viewport/object')
          await checkMetaNameContentPair(
            browser,
            'viewport',
            'width=device-width, initial-scale=1, maximum-scale=1'
          )
        })

        it('should support apple related tags `itunes` and `appWebApp`', async () => {
          const browser = await next.browser('/apple')
          await checkMetaNameContentPair(
            browser,
            'apple-itunes-app',
            'app-id=myAppStoreID, app-argument=myAppArgument'
          )
          await checkMetaNameContentPair(
            browser,
            'apple-mobile-web-app-capable',
            'yes'
          )
          await checkMetaNameContentPair(
            browser,
            'apple-mobile-web-app-title',
            'Apple Web App'
          )
          await checkMetaNameContentPair(
            browser,
            'apple-mobile-web-app-status-bar-style',
            'black-translucent'
          )

          expect(
            await queryMetaProps(
              browser,
              'link',
              'href="/assets/startup/apple-touch-startup-image-768x1004.png"',
              ['rel', 'media']
            )
          ).toEqual({
            rel: 'apple-touch-startup-image',
            media: null,
          })

          expect(
            await queryMetaProps(
              browser,
              'link',
              'href="/assets/startup/apple-touch-startup-image-1536x2008.png"',
              ['rel', 'media']
            )
          ).toEqual({
            rel: 'apple-touch-startup-image',
            media: '(device-width: 768px) and (device-height: 1024px)',
          })
        })

        it('should support alternate tags', async () => {
          const browser = await next.browser('/alternate')
          await checkLink(browser, 'canonical', 'https://example.com')
          await checkMeta(
            browser,
            'en-US',
            'https://example.com/en-US',
            'hreflang',
            'link',
            'href'
          )
          await checkMeta(
            browser,
            'de-DE',
            'https://example.com/de-DE',
            'hreflang',
            'link',
            'href'
          )
          await checkMeta(
            browser,
            'only screen and (max-width: 600px)',
            'https://example.com/mobile',
            'media',
            'link',
            'href'
          )
          await checkMeta(
            browser,
            'application/rss+xml',
            'https://example.com/rss',
            'type',
            'link',
            'href'
          )
        })

        it('should apply metadata when navigating client-side', async () => {
          const browser = await next.browser('/')

          expect(await getTitle(browser)).toBe('index page')
          await browser
            .elementByCss('#to-basic')
            .click()
            .waitForElementByCss('#basic', 2000)

          await checkMetaNameContentPair(
            browser,
            'referrer',
            'origin-when-crossorigin'
          )
          await browser.back().waitForElementByCss('#index', 2000)
          expect(await getTitle(browser)).toBe('index page')
          await browser
            .elementByCss('#to-title')
            .click()
            .waitForElementByCss('#title', 2000)
          expect(await getTitle(browser)).toBe('this is the page title')
        })
      })

      describe('opengraph', () => {
        it('should support opengraph tags', async () => {
          const browser = await next.browser('/opengraph')
          await checkMetaPropertyContentPair(
            browser,
            'og:title',
            'My custom title'
          )
          await checkMetaPropertyContentPair(
            browser,
            'og:description',
            'My custom description'
          )
          await checkMetaPropertyContentPair(
            browser,
            'og:url',
            'https://example.com/'
          )
          await checkMetaPropertyContentPair(
            browser,
            'og:site_name',
            'My custom site name'
          )
          await checkMetaPropertyContentPair(browser, 'og:locale', 'en-US')
          await checkMetaPropertyContentPair(browser, 'og:type', 'website')
          await checkMetaPropertyContentPair(browser, 'og:image:url', [
            'https://example.com/image.png',
            'https://example.com/image2.png',
          ])
          await checkMetaPropertyContentPair(browser, 'og:image:width', [
            '800',
            '1800',
          ])
          await checkMetaPropertyContentPair(browser, 'og:image:height', [
            '600',
            '1600',
          ])
          await checkMetaPropertyContentPair(
            browser,
            'og:image:alt',
            'My custom alt'
          )
        })

        it('should support opengraph with article type', async () => {
          const browser = await next.browser('/opengraph/article')
          await checkMetaPropertyContentPair(
            browser,
            'og:title',
            'My custom title'
          )
          await checkMetaPropertyContentPair(
            browser,
            'og:description',
            'My custom description'
          )
          await checkMetaPropertyContentPair(browser, 'og:type', 'article')
          await checkMetaPropertyContentPair(
            browser,
            'article:published_time',
            '2023-01-01T00:00:00.000Z'
          )
          await checkMetaPropertyContentPair(browser, 'article:author', [
            'author1',
            'author2',
            'author3',
          ])
        })
      })

      describe('icons', () => {
        it('should support basic object icons field', async () => {
          const browser = await next.browser('/icons')

          await checkLink(browser, 'shortcut icon', '/shortcut-icon.png')
          await checkLink(browser, 'icon', '/icon.png')
          await checkLink(browser, 'apple-touch-icon', '/apple-icon.png')
          await checkLink(
            browser,
            'apple-touch-icon-precomposed',
            '/apple-touch-icon-precomposed.png'
          )
        })

        it('should support basic string icons field', async () => {
          const browser = await next.browser('/icons/string')
          await checkLink(browser, 'icon', '/icon.png')
        })

        it('should support basic complex descriptor icons field', async () => {
          const browser = await next.browser('/icons/descriptor')

          await checkLink(browser, 'shortcut icon', '/shortcut-icon.png')
          await checkLink(browser, 'icon', [
            '/icon.png',
            'https://example.com/icon.png',
          ])
          await checkLink(browser, 'apple-touch-icon', [
            '/apple-icon.png',
            '/apple-icon-x3.png',
          ])

          await checkLink(
            browser,
            'apple-touch-icon-precomposed',
            '/apple-touch-icon-precomposed.png'
          )

          expect(
            await queryMetaProps(browser, 'link', 'href="/apple-icon-x3.png"', [
              'sizes',
              'type',
            ])
          ).toEqual({ sizes: '180x180', type: 'image/png' })
        })
      })

      describe('twitter', () => {
        it('should support default twitter summary card', async () => {
          const browser = await next.browser('/twitter')
          const expected = {
            title: 'Twitter Title',
            description: 'Twitter Description',
            'site:id': 'siteId',
            creator: 'creator',
            'creator:id': 'creatorId',
            image: 'https://twitter.com/image.png',
            card: 'summary',
          }

          await Promise.all(
            Object.keys(expected).map(async (key) => {
              return checkMetaNameContentPair(
                browser,
                `twitter:${key}`,
                expected[key]
              )
            })
          )
        })

        it('should support default twitter summary_large_image card', async () => {
          const browser = await next.browser('/twitter/large-image')
          const expected = {
            title: 'Twitter Title',
            description: 'Twitter Description',
            'site:id': 'siteId',
            creator: 'creator',
            'creator:id': 'creatorId',
            image: 'https://twitter.com/image.png',
            card: 'summary_large_image',
          }

          await Promise.all(
            Object.keys(expected).map((key) => {
              return checkMetaNameContentPair(
                browser,
                `twitter:${key}`,
                expected[key]
              )
            })
          )
        })

        it('should support default twitter player card', async () => {
          const browser = await next.browser('/twitter/player')
          const expected = {
            title: 'Twitter Title',
            description: 'Twitter Description',
            'site:id': 'siteId',
            creator: 'creator',
            'creator:id': 'creatorId',
            image: 'https://twitter.com/image.png',
            // player properties
            card: 'player',
            player: 'https://twitter.com/player',
            'player:stream': 'https://twitter.com/stream',
            'player:width': '100',
            'player:height': '100',
          }

          await Promise.all(
            Object.keys(expected).map((key) => {
              return checkMetaNameContentPair(
                browser,
                `twitter:${key}`,
                expected[key]
              )
            })
          )
        })

        it('should support default twitter app card', async () => {
          const browser = await next.browser('/twitter/app')
          const expected = {
            title: 'Twitter Title',
            description: 'Twitter Description',
            'site:id': 'siteId',
            creator: 'creator',
            'creator:id': 'creatorId',
            image: [
              'https://twitter.com/image-100x100.png',
              'https://twitter.com/image-200x200.png',
            ],
            // app properties
            card: 'app',
            'app:id:iphone': 'twitter_app://iphone',
            'app:url:iphone': 'twitter_app://iphone',
            'app:id:ipad': 'twitter_app://iphone',
            'app:url:ipad': 'twitter_app://iphone',
            'app:id:googleplay': 'twitter_app://iphone',
            'app:url:googleplay': 'twitter_app://iphone',
          }

          await Promise.all(
            Object.keys(expected).map((key) => {
              return checkMetaNameContentPair(
                browser,
                `twitter:${key}`,
                expected[key]
              )
            })
          )
        })
      })
    })
  }
)
