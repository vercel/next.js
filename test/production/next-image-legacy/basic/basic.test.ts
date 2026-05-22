import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'

const emptyImage =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('Image Component Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  type Browser = Playwright

  async function hasPreloadLinkMatchingUrl(browser, url) {
    const links = await browser.elementsByCss('link[rel=preload][as=image]')
    for (const link of links) {
      const imagesrcset = await link.getAttribute('imagesrcset')
      const href = await link.getAttribute('href')
      if (imagesrcset?.includes(url) || (!imagesrcset && href === url)) {
        return true
      }
    }
    return false
  }

  async function hasImagePreloadBeforeCSSPreload(browser) {
    const links = await browser.elementsByCss('link')
    let foundImage = false
    for (const link of links) {
      const rel = await link.getAttribute('rel')
      if (rel === 'preload') {
        const linkAs = await link.getAttribute('as')
        if (linkAs === 'image') {
          foundImage = true
        } else if (linkAs === 'style' && foundImage) {
          return true
        }
      }
    }
    return false
  }

  function runTests(browser: () => Browser) {
    it('should render an image tag', async () => {
      expect(await browser().hasElementByCssSelector('img')).toBeTruthy()
    })
    it('should support passing through arbitrary attributes', async () => {
      expect(
        await browser().hasElementByCssSelector('img#attribute-test')
      ).toBeTruthy()
      expect(
        await browser()
          .elementByCss('img#attribute-test')
          .getAttribute('data-demo')
      ).toBe('demo-value')
    })
    it('should modify src with the loader', async () => {
      expect(
        await browser().elementById('basic-image').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/foo.jpg?auto=format&fit=max&w=1024&q=60'
      )
    })
    it('should correctly generate src even if preceding slash is included in prop', async () => {
      expect(
        await browser().elementById('preceding-slash-image').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=1024'
      )
    })
    it('should add a srcset based on the loader', async () => {
      expect(
        await browser().elementById('basic-image').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/foo.jpg?auto=format&fit=max&w=480&q=60 1x, https://example.com/myaccount/foo.jpg?auto=format&fit=max&w=1024&q=60 2x'
      )
    })
    it('should add a srcset even with preceding slash in prop', async () => {
      expect(
        await browser()
          .elementById('preceding-slash-image')
          .getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=480 1x, https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=1024 2x'
      )
    })
    it('should use imageSizes when width matches, not deviceSizes from next.config.js', async () => {
      expect(
        await browser().elementById('icon-image-16').getAttribute('src')
      ).toBe('https://example.com/myaccount/icon.png?auto=format&fit=max&w=32')
      expect(
        await browser().elementById('icon-image-16').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/icon.png?auto=format&fit=max&w=16 1x, https://example.com/myaccount/icon.png?auto=format&fit=max&w=32 2x'
      )
      expect(
        await browser().elementById('icon-image-32').getAttribute('src')
      ).toBe('https://example.com/myaccount/icon.png?auto=format&fit=max&w=64')
      expect(
        await browser().elementById('icon-image-32').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/icon.png?auto=format&fit=max&w=32 1x, https://example.com/myaccount/icon.png?auto=format&fit=max&w=64 2x'
      )
    })
    it('should support the unoptimized attribute', async () => {
      expect(
        await browser().elementById('unoptimized-image').getAttribute('src')
      ).toBe('https://arbitraryurl.com/foo.jpg')
    })
    it('should not add a srcset if unoptimized attribute present', async () => {
      expect(
        await browser().elementById('unoptimized-image').getAttribute('srcset')
      ).toBeFalsy()
    })
    it('should keep auto parameter if already set', async () => {
      expect(
        await browser().elementById('image-with-param-auto').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/foo.png?auto=compress&fit=max&w=1024'
      )
    })
    it('should keep width parameter if already set', async () => {
      expect(
        await browser()
          .elementById('image-with-param-width')
          .getAttribute('src')
      ).toBe('https://example.com/myaccount/foo.png?auto=format&w=500&fit=max')
    })
    it('should keep fit parameter if already set', async () => {
      expect(
        await browser().elementById('image-with-param-fit').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/foo.png?auto=format&fit=crop&w=300&h=300'
      )
    })
  }

  function lazyLoadingTests(browser: () => Browser) {
    it('should have loaded the first image immediately', async () => {
      expect(await browser().elementById('lazy-top').getAttribute('src')).toBe(
        'https://example.com/myaccount/lazy1.jpg?auto=format&fit=max&w=2000'
      )
      expect(
        await browser().elementById('lazy-top').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/lazy1.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/lazy1.jpg?auto=format&fit=max&w=2000 2x'
      )
    })
    it('should not have loaded the second image immediately', async () => {
      expect(await browser().elementById('lazy-mid').getAttribute('src')).toBe(
        emptyImage
      )
      expect(
        await browser().elementById('lazy-mid').getAttribute('srcset')
      ).toBeFalsy()
    })
    it('should pass through classes on a lazy loaded image', async () => {
      expect(
        await browser().elementById('lazy-mid').getAttribute('class')
      ).toBe('exampleclass')
    })
    it('should load the second image after scrolling down', async () => {
      const b = browser()
      let viewportHeight = await b.eval(`window.innerHeight`)
      let topOfMidImage = await b.eval(
        `document.getElementById('lazy-mid').parentElement.offsetTop`
      )
      let buffer = 150
      await b.eval(
        `window.scrollTo(0, ${topOfMidImage - (viewportHeight + buffer)})`
      )

      await retry(async () => {
        expect(await b.elementById('lazy-mid').getAttribute('src')).toBe(
          'https://example.com/myaccount/lazy2.jpg?auto=format&fit=max&w=1024'
        )
      })

      await retry(async () => {
        expect(await b.elementById('lazy-mid').getAttribute('srcset')).toBe(
          'https://example.com/myaccount/lazy2.jpg?auto=format&fit=max&w=480 1x, https://example.com/myaccount/lazy2.jpg?auto=format&fit=max&w=1024 2x'
        )
      })
    })
    it('should not have loaded the third image after scrolling down', async () => {
      expect(
        await browser().elementById('lazy-bottom').getAttribute('src')
      ).toBe(emptyImage)
      expect(
        await browser().elementById('lazy-bottom').getAttribute('srcset')
      ).toBeFalsy()
    })
    it('should load the third image, which is unoptimized, after scrolling further down', async () => {
      const b = browser()
      let viewportHeight = await b.eval(`window.innerHeight`)
      let topOfBottomImage = await b.eval(
        `document.getElementById('lazy-bottom').parentElement.offsetTop`
      )
      let buffer = 150
      await b.eval(
        `window.scrollTo(0, ${topOfBottomImage - (viewportHeight + buffer)})`
      )
      await new Promise((r) => setTimeout(r, 200))
      expect(await b.elementById('lazy-bottom').getAttribute('src')).toBe(
        'https://www.otherhost.com/lazy3.jpg'
      )
      expect(
        await b.elementById('lazy-bottom').getAttribute('srcset')
      ).toBeFalsy()
    })
    it('should load the fourth image lazily after scrolling down', async () => {
      const b = browser()
      expect(
        await b.elementById('lazy-without-attribute').getAttribute('src')
      ).toBe(emptyImage)
      expect(
        await b.elementById('lazy-without-attribute').getAttribute('srcset')
      ).toBeFalsy()
      let viewportHeight = await b.eval(`window.innerHeight`)
      let topOfBottomImage = await b.eval(
        `document.getElementById('lazy-without-attribute').parentElement.offsetTop`
      )
      let buffer = 150
      await b.eval(
        `window.scrollTo(0, ${topOfBottomImage - (viewportHeight + buffer)})`
      )
      await new Promise((r) => setTimeout(r, 200))
      expect(
        await b.elementById('lazy-without-attribute').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/lazy4.jpg?auto=format&fit=max&w=1600'
      )
      expect(
        await b.elementById('lazy-without-attribute').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/lazy4.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/lazy4.jpg?auto=format&fit=max&w=1600 2x'
      )
    })

    it('should load the fifth image eagerly, without scrolling', async () => {
      expect(
        await browser().elementById('eager-loading').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/lazy5.jpg?auto=format&fit=max&w=2000'
      )
      expect(
        await browser().elementById('eager-loading').getAttribute('srcset')
      ).toBeTruthy()
    })

    it('should load the sixth image, which has lazyBoundary property after scrolling down', async () => {
      const b = browser()
      expect(await b.elementById('lazy-boundary').getAttribute('src')).toBe(
        emptyImage
      )
      expect(
        await b.elementById('lazy-boundary').getAttribute('srcset')
      ).toBeFalsy()
      let viewportHeight = await b.eval(`window.innerHeight`)
      let topOfBottomImage = await b.eval(
        `document.getElementById('lazy-boundary').parentElement.offsetTop`
      )
      let buffer = 450
      await b.eval(
        `window.scrollTo(0, ${topOfBottomImage - (viewportHeight + buffer)})`
      )

      await retry(async () => {
        expect(
          await b.eval(
            'document.querySelector("#lazy-boundary").getAttribute("src")'
          )
        ).toBe(
          'https://example.com/myaccount/lazy6.jpg?auto=format&fit=max&w=1600'
        )
      })

      await retry(async () => {
        expect(
          await b.eval(
            'document.querySelector("#lazy-boundary").getAttribute("srcset")'
          )
        ).toBe(
          'https://example.com/myaccount/lazy6.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/lazy6.jpg?auto=format&fit=max&w=1600 2x'
        )
      })
    })
  }

  describe('SSR Image Component Tests', () => {
    let browser: Playwright
    beforeAll(async () => {
      browser = await next.browser('/')
    })
    runTests(() => browser)

    it('should add a preload tag for a priority image', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          browser,
          'https://example.com/myaccount/withpriority.png?auto=format&fit=max&w=1024&q=60'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image with preceding slash', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          browser,
          'https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=1024'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image, with arbitrary host', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          browser,
          'https://arbitraryurl.com/withpriority3.png'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image, with quality', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          browser,
          'https://example.com/myaccount/withpriority.png?auto=format&fit=max&w=1024&q=60'
        )
      ).toBe(true)
    })
    it('should not create any preload tags higher up the page than CSS preload tags', async () => {
      expect(await hasImagePreloadBeforeCSSPreload(browser)).toBe(false)
    })
    it('should add data-nimg data attribute based on layout', async () => {
      expect(
        await browser.elementById('image-with-sizes').getAttribute('data-nimg')
      ).toBe('responsive')
      expect(
        await browser.elementById('basic-image').getAttribute('data-nimg')
      ).toBe('intrinsic')
    })
    it('should not pass config to custom loader prop', async () => {
      const loaderBrowser = await next.browser('/loader-prop')
      expect(
        await loaderBrowser.elementById('loader-prop-img').getAttribute('src')
      ).toBe('https://example.vercel.sh/success/foo.jpg?width=1024')
      expect(
        await loaderBrowser
          .elementById('loader-prop-img')
          .getAttribute('srcset')
      ).toBe(
        'https://example.vercel.sh/success/foo.jpg?width=480 1x, https://example.vercel.sh/success/foo.jpg?width=1024 2x'
      )
    })
  })

  describe('Client-side Image Component Tests', () => {
    let browser: Playwright
    beforeAll(async () => {
      browser = await next.browser('/')
      await browser.waitForElementByCss('#clientlink').click()
    })
    runTests(() => browser)

    // FIXME: this test
    it.skip('should NOT add a preload tag for a priority image', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          browser,
          'https://example.com/myaccount/withpriorityclient.png?auto=format&fit=max'
        )
      ).toBe(false)
    })
    it('should only be loaded once if `sizes` is set', async () => {
      const numRequests = await browser.eval(`(function() {
        const entries = window.performance.getEntries()
        return entries.filter(function(entry) {
          return entry.name.includes('test-sizes.jpg')
        }).length
      })()`)

      expect(numRequests).toBe(1)
    })
    describe('Client-side Errors', () => {
      beforeAll(async () => {
        await browser.eval(`(function() {
          window.gotHostError = false
          const origError = console.error
          window.console.error = function () {
            if (arguments[0].match(/Image host identifier/)) {
              window.gotHostError = true
            }
            origError.apply(this, arguments)
          }
        })()`)
        await browser.waitForElementByCss('#errorslink').click()
      })
      it('Should not log an error when an unregistered host is used in production', async () => {
        const foundError = await browser.eval('window.gotHostError')
        expect(foundError).toBe(false)
      })
    })
  })

  describe('SSR Lazy Loading Tests', () => {
    let browser: Playwright
    beforeAll(async () => {
      browser = await next.browser('/lazy')
    })
    lazyLoadingTests(() => browser)
  })

  describe('Client-side Lazy Loading Tests', () => {
    let browser: Playwright
    beforeAll(async () => {
      browser = await next.browser('/')
      await browser.waitForElementByCss('#lazylink').click()
      await new Promise((r) => setTimeout(r, 500))
    })
    lazyLoadingTests(() => browser)
  })
})
