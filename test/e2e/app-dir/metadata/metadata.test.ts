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
          expect(values[0]).toContain(content)
        }
      }

      describe('basic', () => {
        it('should support title and description', async () => {
          const browser = await next.browser('/title')
          expect(await browser.eval(`document.title`)).toBe(
            'this is the page title'
          )
          await checkMeta(
            browser,
            'description',
            'this is the layout description',
            'name'
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
          await checkMeta(browser, 'generator', 'next.js', 'name')
          await checkMeta(browser, 'application-name', 'test', 'name')
          await checkMeta(
            browser,
            'referrer',
            'origin-when-crossorigin',
            'name'
          )
          await checkMeta(
            browser,
            'keywords',
            'next.js,react,javascript',
            'name'
          )
          await checkMeta(browser, 'author', 'John Doe,Jane Doe', 'name')
          await checkMeta(browser, 'theme-color', 'cyan', 'name')
          await checkMeta(browser, 'color-scheme', 'dark', 'name')
          await checkMeta(
            browser,
            'viewport',
            'width=device-width, initial-scale=1, shrink-to-fit=no',
            'name'
          )
          await checkMeta(browser, 'creator', 'shu', 'name')
          await checkMeta(browser, 'publisher', 'vercel', 'name')
          await checkMeta(browser, 'robots', 'index, follow', 'name')
        })

        it('should support object viewport', async () => {
          const browser = await next.browser('/viewport/object')
          await checkMeta(
            browser,
            'viewport',
            'width=device-width, initial-scale=1, maximum-scale=1',
            'name'
          )
        })

        it('should support alternate tags', async () => {
          const browser = await next.browser('/alternate')
          await checkMeta(
            browser,
            'canonical',
            'https://example.com',
            'rel',
            'link',
            'href'
          )
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

          await checkMeta(
            browser,
            'referrer',
            'origin-when-crossorigin',
            'name'
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
          await checkMeta(browser, 'og:title', 'My custom title')
          await checkMeta(browser, 'og:description', 'My custom description')
          await checkMeta(browser, 'og:url', 'https://example.com')
          await checkMeta(browser, 'og:site_name', 'My custom site name')
          await checkMeta(browser, 'og:locale', 'en-US')
          await checkMeta(browser, 'og:type', 'website')
          await checkMeta(browser, 'og:image:url', [
            'https://example.com/image.png',
            'https://example.com/image2.png',
          ])
          await checkMeta(browser, 'og:image:width', ['800', '1800'])
          await checkMeta(browser, 'og:image:height', ['600', '1600'])
          await checkMeta(browser, 'og:image:alt', 'My custom alt')
        })

        it('should support opengraph with article type', async () => {
          const browser = await next.browser('/opengraph/article')
          await checkMeta(browser, 'og:title', 'My custom title')
          await checkMeta(browser, 'og:description', 'My custom description')
          await checkMeta(browser, 'og:type', 'article')
          await checkMeta(
            browser,
            'article:published_time',
            '2023-01-01T00:00:00.000Z'
          )
          await checkMeta(browser, 'article:author', [
            'author1',
            'author2',
            'author3',
          ])
        })
      })

      describe('icons', () => {
        const checkLink = (browser, name, content) =>
          checkMeta(browser, name, content, 'rel', 'link', 'href')

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
    })
  }
)
