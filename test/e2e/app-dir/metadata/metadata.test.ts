import { createNextDescribe } from 'e2e-utils'
import { check, hasRedbox, getRedboxDescription } from 'next-test-utils'
import { BrowserInterface } from 'test/lib/browsers/base'

createNextDescribe(
  'app dir - metadata',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextDeploy }) => {
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
      rel: string,
      content: string | string[]
    ) => checkMeta(browser, rel, content, 'rel', 'link', 'href')

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
        // Use the parent layout (root layout) instead of app/title-template/layout.tsx
        expect(await browser.eval(`document.title`)).toBe('Page')
      })

      it('should support stashed title in one layer of page and layout', async () => {
        const browser = await next.browser('/title-template/extra')
        // Use the parent layout (app/title-template/layout.tsx) instead of app/title-template/extra/layout.tsx
        expect(await browser.eval(`document.title`)).toBe('Extra Page | Layout')
      })

      it('should use parent layout title when no title is defined in page', async () => {
        const browser = await next.browser('/title-template/use-layout-title')
        expect(await browser.eval(`document.title`)).toBe(
          'title template layout default'
        )
      })

      it('should support stashed title in two layers of page and layout', async () => {
        const $inner = await next.render$('/title-template/extra/inner')
        expect(await $inner('title').text()).toBe('Inner Page | Extra Layout')

        const $deep = await next.render$('/title-template/extra/inner/deep')
        expect(await $deep('title').text()).toBe(
          'extra layout default | Layout'
        )
      })

      it('should support other basic tags', async () => {
        const browser = await next.browser('/basic')
        await checkMetaNameContentPair(browser, 'generator', 'next.js')
        await checkMetaNameContentPair(browser, 'application-name', 'test')
        await checkLink(browser, 'manifest', 'https://github.com/manifest.json')

        await checkMetaNameContentPair(
          browser,
          'referrer',
          'origin-when-cross-origin'
        )
        await checkMetaNameContentPair(
          browser,
          'keywords',
          'next.js,react,javascript'
        )
        await checkMetaNameContentPair(browser, 'author', ['huozhi', 'tree'])
        await checkLink(browser, 'author', 'https://tree.com')

        await checkMeta(browser, 'theme-color', 'cyan', 'name')
        await checkMeta(
          browser,
          'theme-color',
          '(prefers-color-scheme: dark)',
          'name',
          'meta',
          'media'
        )

        await checkMetaNameContentPair(browser, 'color-scheme', 'dark')
        await checkMetaNameContentPair(
          browser,
          'viewport',
          'width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-visual'
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
          '/mobile',
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

      it('should support robots tags', async () => {
        const browser = await next.browser('/robots')
        await checkMetaNameContentPair(
          browser,
          'robots',
          'noindex, follow, nocache'
        )
        await checkMetaNameContentPair(
          browser,
          'googlebot',
          'index, nofollow, noimageindex, max-video-preview:standard, max-image-preview:-1, max-snippet:-1'
        )
      })

      it('should support verification tags', async () => {
        const browser = await next.browser('/verification')

        await checkMetaNameContentPair(
          browser,
          'google-site-verification',
          'google'
        )
        await checkMetaNameContentPair(browser, 'y_key', 'yahoo')
        await checkMetaNameContentPair(browser, 'yandex-verification', 'yandex')
        await checkMetaNameContentPair(browser, 'me', ['my-email', 'my-link'])
      })

      it('should support appLinks tags', async () => {
        const browser = await next.browser('/app-links')
        await checkMetaPropertyContentPair(
          browser,
          'al:ios:url',
          'https://example.com/ios'
        )
        await checkMetaPropertyContentPair(
          browser,
          'al:ios:app_store_id',
          'app_store_id'
        )
        await checkMetaPropertyContentPair(
          browser,
          'al:android:package',
          'com.example.android/package'
        )
        await checkMetaPropertyContentPair(
          browser,
          'al:android:app_name',
          'app_name_android'
        )
        await checkMetaPropertyContentPair(
          browser,
          'al:web:should_fallback',
          'true'
        )
      })

      it('should apply metadata when navigating client-side', async () => {
        const browser = await next.browser('/')

        expect(await getTitle(browser)).toBe('index page')
        await browser
          .elementByCss('#to-basic')
          .click()
          .waitForElementByCss('#basic')

        await checkMetaNameContentPair(
          browser,
          'referrer',
          'origin-when-cross-origin'
        )
        await browser.back().waitForElementByCss('#index')
        expect(await getTitle(browser)).toBe('index page')
        await browser
          .elementByCss('#to-title')
          .click()
          .waitForElementByCss('#title')
        expect(await getTitle(browser)).toBe('this is the page title')
      })

      it('should support generateMetadata export', async () => {
        const browser = await next.browser('/async/slug')
        expect(await getTitle(browser)).toBe('params - slug')

        await checkMetaNameContentPair(browser, 'keywords', 'parent,child')

        await browser.loadPage(next.url + '/async/blog?q=xxx')
        await check(
          () => browser.elementByCss('p').text(),
          /params - blog query - xxx/
        )
      })

      it('should support notFound and redirect in generateMetadata', async () => {
        const resNotFound = await next.fetch('/async/not-found')
        expect(resNotFound.status).toBe(404)
        const notFoundHtml = await resNotFound.text()
        expect(notFoundHtml).not.toBe('not-found-text')
        expect(notFoundHtml).toContain('This page could not be found.')

        const resRedirect = await next.fetch('/async/redirect')
        expect(resRedirect.status).toBe(307)
      })

      if (isNextDev) {
        it('should freeze parent resolved metadata to avoid mutating in generateMetadata', async () => {
          const pagePath = 'app/mutate/page.tsx'
          const content = `export default function page(props) {
            return <p>mutate</p>
          }

          export async function generateMetadata(props, parent) {
            const parentMetadata = await parent
            parentMetadata.x = 1
            return {
              ...parentMetadata,
            }
          }`

          try {
            await next.patchFile(pagePath, content)

            const browser = await next.browser('/mutate')
            await check(
              async () =>
                (await hasRedbox(browser, true)) ? 'success' : 'fail',
              /success/
            )

            expect(await getRedboxDescription(browser)).toContain(
              'Cannot add property x, object is not extensible'
            )
          } finally {
            await next.deleteFile(pagePath)
          }
        })
      }

      it('should handle metadataBase for urls resolved as only URL type', async () => {
        // including few urls in opengraph and alternates
        const url$ = await next.render$('/metadata-base/url')

        // compose with metadataBase
        expect(url$('link[rel="canonical"]').attr('href')).toBe(
          'https://bar.example/url/subpath'
        )

        // override metadataBase
        const urlInstance$ = await next.render$('/metadata-base/url-instance')
        expect(urlInstance$('meta[property="og:url"]').attr('content')).toBe(
          'http://https//outerspace.com/huozhi.png'
        )
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
        await checkMetaPropertyContentPair(browser, 'og:image', [
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

      it('should pick up opengraph-image and twitter-image as static metadata files', async () => {
        const $ = await next.render$('/opengraph/static')
        expect($('[property="og:image"]').attr('content')).toMatch(
          /https:\/\/example.com\/_next\/static\/media\/metadata\/opengraph-image.\w+.png/
        )
        expect($('[property="og:image:type"]').attr('content')).toBe(
          'image/png'
        )
        expect($('[property="og:image:width"]').attr('content')).toBe('114')
        expect($('[property="og:image:height"]').attr('content')).toBe('114')

        expect($('[name="twitter:image"]').attr('content')).toMatch(
          /https:\/\/example.com\/_next\/static\/media\/metadata\/twitter-image.\w+.png/
        )
        expect($('[name="twitter:card"]').attr('content')).toBe(
          'summary_large_image'
        )

        // favicon shouldn't be overridden
        const $icon = $('link[rel="icon"]')
        expect($icon.attr('href')).toMatch(
          /_next\/static\/media\/metadata\/favicon.\w+.ico/
        )
      })
    })

    describe('icons', () => {
      it('should support basic object icons field', async () => {
        const browser = await next.browser('/icons')

        await checkLink(browser, 'shortcut icon', '/shortcut-icon.png')
        await checkLink(browser, 'icon', '/icon.png')
        await checkLink(browser, 'apple-touch-icon', '/apple-icon.png')
        await checkLink(browser, 'other-touch-icon', '/other-touch-icon.png')
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

        await checkLink(browser, 'other-touch-icon', '/other-touch-icon.png')

        expect(
          await queryMetaProps(browser, 'link', 'href="/apple-icon-x3.png"', [
            'sizes',
            'type',
          ])
        ).toEqual({ sizes: '180x180', type: 'image/png' })
      })

      it('should support root level of favicon.ico', async () => {
        let $ = await next.render$('/')
        let $icon = $('link[rel="icon"]')
        expect($icon.attr('href')).toMatch(
          /_next\/static\/media\/metadata\/favicon.\w+.ico/
        )
        expect($icon.attr('type')).toBe('image/x-icon')
        expect($icon.attr('sizes')).toBe('any')

        $ = await next.render$('/basic')
        $icon = $('link[rel="icon"]')
        expect($icon.attr('href')).toMatch(
          /_next\/static\/media\/metadata\/favicon.\w+.ico/
        )
        expect($icon.attr('sizes')).toBe('any')
      })
    })

    describe('file based icons', () => {
      it('should render icon and apple touch icon meta if their images are specified', async () => {
        const $ = await next.render$('/icons/static/nested')

        const $icon = $('head > link[rel="icon"][type!="image/x-icon"]')
        const $appleIcon = $('head > link[rel="apple-touch-icon"]')

        expect($icon.attr('href')).toMatch(
          /\/_next\/static\/media\/metadata\/icon1\.\w+\.png/
        )
        expect($icon.attr('sizes')).toBe('32x32')
        expect($icon.attr('type')).toBe('image/png')
        expect($appleIcon.attr('href')).toMatch(
          /\/_next\/static\/media\/metadata\/apple-icon\.\w+\.png/
        )
        expect($appleIcon.attr('type')).toBe('image/png')
        expect($appleIcon.attr('sizes')).toMatch('114x114')
      })

      it('should not render if image file is not specified', async () => {
        const $ = await next.render$('/icons/static')

        const $icon = $('head > link[rel="icon"][type!="image/x-icon"]')
        const $appleIcon = $('head > link[rel="apple-touch-icon"]')

        expect($icon.attr('href')).toMatch(
          /\/_next\/static\/media\/metadata\/icon\.\w+\.png/
        )
        expect($icon.attr('sizes')).toBe('114x114')

        expect($appleIcon.length).toBe(0)
      })

      if (isNextDev) {
        it('should handle hmr updates to the file icon', async () => {
          await next.renameFile(
            'app/icons/static/icon.png',
            'app/icons/static/icon2.png'
          )

          await check(async () => {
            const $ = await next.render$('/icons/static')
            const $icon = $('head > link[rel="icon"][type!="image/x-icon"]')
            return $icon.attr('href')
          }, /\/_next\/static\/media\/metadata\/icon2\.\w+\.png/)

          await next.renameFile(
            'app/icons/static/icon2.png',
            'app/icons/static/icon.png'
          )
        })
      }
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
          'image:alt': 'image-alt',
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
          'app:id:ipad': 'twitter_app://ipad',
          'app:id:googleplay': 'twitter_app://googleplay',
          'app:url:iphone': 'https://iphone_url',
          'app:url:ipad': 'https://ipad_url',
          'app:url:googleplay': undefined,
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

    describe('react cache', () => {
      it('should have same title and page value on initial load', async () => {
        const browser = await next.browser('/cache-deduping')
        const value = await browser.elementByCss('#value').text()
        const value2 = await browser.elementByCss('#value2').text()
        // Value in the title should match what's shown on the page component
        const title = await browser.eval(`document.title`)
        const obj = JSON.parse(title)
        // Check `cache()`
        expect(obj.val.toString()).toBe(value)
        // Check `fetch()`
        // TODO-APP: Investigate why fetch deduping doesn't apply but cache() does.
        if (!isNextDev) {
          expect(obj.val2.toString()).toBe(value2)
        }
      })

      it('should have same title and page value when navigating', async () => {
        const browser = await next.browser('/cache-deduping/navigating')
        await browser
          .elementByCss('#link-to-deduping-page')
          .click()
          .waitForElementByCss('#value')
        const value = await browser.elementByCss('#value').text()
        const value2 = await browser.elementByCss('#value2').text()
        // Value in the title should match what's shown on the page component
        const title = await browser.eval(`document.title`)
        const obj = JSON.parse(title)
        // Check `cache()`
        expect(obj.val.toString()).toBe(value)
        // Check `fetch()`
        // TODO-APP: Investigate why fetch deduping doesn't apply but cache() does.
        if (!isNextDev) {
          expect(obj.val2.toString()).toBe(value2)
        }
      })
    })
  }
)
