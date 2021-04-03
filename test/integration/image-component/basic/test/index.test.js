/* eslint-env jest */

import {
  check,
  findPort,
  killApp,
  nextBuild,
  nextStart,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser
const emptyImage =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

function runTests() {
  it('should render an image tag', async () => {
    await waitFor(1000)
    expect(await browser.hasElementByCssSelector('img')).toBeTruthy()
  })
  it('should support passing through arbitrary attributes', async () => {
    expect(
      await browser.hasElementByCssSelector('img#attribute-test')
    ).toBeTruthy()
    expect(
      await browser.elementByCss('img#attribute-test').getAttribute('data-demo')
    ).toBe('demo-value')
  })
  it('should modify src with the loader', async () => {
    expect(await browser.elementById('basic-image').getAttribute('src')).toBe(
      'https://example.com/myaccount/foo.jpg?auto=format&fit=max&w=1024&q=60'
    )
  })
  it('should correctly generate src even if preceding slash is included in prop', async () => {
    expect(
      await browser.elementById('preceding-slash-image').getAttribute('src')
    ).toBe(
      'https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=1024'
    )
  })
  it('should add a srcset based on the loader', async () => {
    expect(
      await browser.elementById('basic-image').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/foo.jpg?auto=format&fit=max&w=480&q=60 1x, https://example.com/myaccount/foo.jpg?auto=format&fit=max&w=1024&q=60 2x'
    )
  })
  it('should add a srcset even with preceding slash in prop', async () => {
    expect(
      await browser.elementById('preceding-slash-image').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=480 1x, https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=1024 2x'
    )
  })
  it('should use imageSizes when width matches, not deviceSizes from next.config.js', async () => {
    expect(await browser.elementById('icon-image-16').getAttribute('src')).toBe(
      'https://example.com/myaccount/icon.png?auto=format&fit=max&w=32'
    )
    expect(
      await browser.elementById('icon-image-16').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/icon.png?auto=format&fit=max&w=16 1x, https://example.com/myaccount/icon.png?auto=format&fit=max&w=32 2x'
    )
    expect(await browser.elementById('icon-image-32').getAttribute('src')).toBe(
      'https://example.com/myaccount/icon.png?auto=format&fit=max&w=64'
    )
    expect(
      await browser.elementById('icon-image-32').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/icon.png?auto=format&fit=max&w=32 1x, https://example.com/myaccount/icon.png?auto=format&fit=max&w=64 2x'
    )
  })
  it('should support the unoptimized attribute', async () => {
    expect(
      await browser.elementById('unoptimized-image').getAttribute('src')
    ).toBe('https://arbitraryurl.com/foo.jpg')
  })
  it('should not add a srcset if unoptimized attribute present', async () => {
    expect(
      await browser.elementById('unoptimized-image').getAttribute('srcset')
    ).toBeFalsy()
  })
}

function lazyLoadingTests() {
  it('should have loaded the first image immediately', async () => {
    expect(await browser.elementById('lazy-top').getAttribute('src')).toBe(
      'https://example.com/myaccount/foo1.jpg?auto=format&fit=max&w=2000'
    )
    expect(await browser.elementById('lazy-top').getAttribute('srcset')).toBe(
      'https://example.com/myaccount/foo1.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foo1.jpg?auto=format&fit=max&w=2000 2x'
    )
  })
  it('should not have loaded the second image immediately', async () => {
    expect(await browser.elementById('lazy-mid').getAttribute('src')).toBe(
      emptyImage
    )
    expect(
      await browser.elementById('lazy-mid').getAttribute('srcset')
    ).toBeFalsy()
  })
  it('should pass through classes on a lazy loaded image', async () => {
    expect(await browser.elementById('lazy-mid').getAttribute('class')).toBe(
      'exampleclass'
    )
  })
  it('should load the second image after scrolling down', async () => {
    let viewportHeight = await browser.eval(`window.innerHeight`)
    let topOfMidImage = await browser.eval(
      `document.getElementById('lazy-mid').parentElement.offsetTop`
    )
    let buffer = 150
    await browser.eval(
      `window.scrollTo(0, ${topOfMidImage - (viewportHeight + buffer)})`
    )

    await check(() => {
      return browser.elementById('lazy-mid').getAttribute('src')
    }, 'https://example.com/myaccount/foo2.jpg?auto=format&fit=max&w=1024')

    await check(() => {
      return browser.elementById('lazy-mid').getAttribute('srcset')
    }, 'https://example.com/myaccount/foo2.jpg?auto=format&fit=max&w=480 1x, https://example.com/myaccount/foo2.jpg?auto=format&fit=max&w=1024 2x')
  })
  it('should not have loaded the third image after scrolling down', async () => {
    expect(await browser.elementById('lazy-bottom').getAttribute('src')).toBe(
      emptyImage
    )
    expect(
      await browser.elementById('lazy-bottom').getAttribute('srcset')
    ).toBeFalsy()
  })
  it('should load the third image, which is unoptimized, after scrolling further down', async () => {
    let viewportHeight = await browser.eval(`window.innerHeight`)
    let topOfBottomImage = await browser.eval(
      `document.getElementById('lazy-bottom').parentElement.offsetTop`
    )
    let buffer = 150
    await browser.eval(
      `window.scrollTo(0, ${topOfBottomImage - (viewportHeight + buffer)})`
    )
    await waitFor(200)
    expect(await browser.elementById('lazy-bottom').getAttribute('src')).toBe(
      'https://www.otherhost.com/foo3.jpg'
    )
    expect(
      await browser.elementById('lazy-bottom').getAttribute('srcset')
    ).toBeFalsy()
  })
  it('should load the fourth image lazily after scrolling down', async () => {
    expect(
      await browser.elementById('lazy-without-attribute').getAttribute('src')
    ).toBe(emptyImage)
    expect(
      await browser.elementById('lazy-without-attribute').getAttribute('srcset')
    ).toBeFalsy()
    let viewportHeight = await browser.eval(`window.innerHeight`)
    let topOfBottomImage = await browser.eval(
      `document.getElementById('lazy-without-attribute').parentElement.offsetTop`
    )
    let buffer = 150
    await browser.eval(
      `window.scrollTo(0, ${topOfBottomImage - (viewportHeight + buffer)})`
    )
    await waitFor(200)
    expect(
      await browser.elementById('lazy-without-attribute').getAttribute('src')
    ).toBe('https://example.com/myaccount/foo4.jpg?auto=format&fit=max&w=1600')
    expect(
      await browser.elementById('lazy-without-attribute').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/foo4.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foo4.jpg?auto=format&fit=max&w=1600 2x'
    )
  })

  it('should load the fifth image eagerly, without scrolling', async () => {
    expect(await browser.elementById('eager-loading').getAttribute('src')).toBe(
      'https://example.com/myaccount/foo5.jpg?auto=format&fit=max&w=2000'
    )
    expect(
      await browser.elementById('eager-loading').getAttribute('srcset')
    ).toBeTruthy()
  })
}

async function hasPreloadLinkMatchingUrl(url) {
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

async function hasImagePreloadBeforeCSSPreload() {
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

describe('Image Component Tests', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))
  describe('SSR Image Component Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
    it('should add a preload tag for a priority image', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://example.com/myaccount/withpriority.png?auto=format&fit=max&w=1024&q=60'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image with preceding slash', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://example.com/myaccount/fooslash.jpg?auto=format&fit=max&w=1024'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image, with arbitrary host', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://arbitraryurl.com/withpriority3.png'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image, with quality', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://example.com/myaccount/withpriority.png?auto=format&fit=max&w=1024&q=60'
        )
      ).toBe(true)
    })
    it('should not create any preload tags higher up the page than CSS preload tags', async () => {
      expect(await hasImagePreloadBeforeCSSPreload()).toBe(false)
    })
  })
  describe('Client-side Image Component Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
      await browser.waitForElementByCss('#clientlink').click()
    })
    afterAll(async () => {
      browser = null
    })
    runTests()
    // FIXME: this test
    it.skip('should NOT add a preload tag for a priority image', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://example.com/myaccount/withpriorityclient.png?auto=format&fit=max'
        )
      ).toBe(false)
    })
    it('should only be loaded once if `sizes` is set', async () => {
      // Get all network requests
      const resourceEntries = await browser.eval(
        'window.performance.getEntries()'
      )

      // "test-sizes.jpg" should only occur once
      const requests = resourceEntries.filter((entry) =>
        entry.name.includes('test-sizes.jpg')
      )
      expect(requests.length).toBe(1)
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
  test("it should render blob url's", async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/blob-src')
      const id = 'blob-image'

      // Wait for blob URL to be created and set
      await check(
        async () =>
          browser.eval(`document.getElementById(${JSON.stringify(id)}).src`),
        /^blob:/
      )

      // image will be unoptimized so there will be no srcSet
      expect(
        await browser.eval(
          `document.getElementById(${JSON.stringify(id)}).srcSet`
        )
      ).toBeNull()
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
  describe('SSR Lazy Loading Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/lazy')
    })
    afterAll(async () => {
      browser = null
    })
    lazyLoadingTests()
    it('should automatically load images if observer does not exist', async () => {
      browser = await webdriver(appPort, '/missing-observer')
      expect(
        await browser.elementById('lazy-no-observer').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000'
      )
      expect(
        await browser.elementById('lazy-no-observer').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000 2x'
      )
    })
  })
  describe('Client-side Lazy Loading Tests', () => {
    beforeAll(async () => {
      browser = await webdriver(appPort, '/')
      await browser.waitForElementByCss('#lazylink').click()
      await waitFor(500)
    })
    afterAll(async () => {
      browser = null
    })
    lazyLoadingTests()
    it('should automatically load images if observer does not exist', async () => {
      await browser.waitForElementByCss('#observerlink').click()
      await waitFor(500)
      browser = await webdriver(appPort, '/missing-observer')
      expect(
        await browser.elementById('lazy-no-observer').getAttribute('src')
      ).toBe(
        'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000'
      )
      expect(
        await browser.elementById('lazy-no-observer').getAttribute('srcset')
      ).toBe(
        'https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=1024 1x, https://example.com/myaccount/foox.jpg?auto=format&fit=max&w=2000 2x'
      )
    })
  })
})
