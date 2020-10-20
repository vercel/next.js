/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
let appPort
let app
let browser

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
      'https://example.com/myaccount/foo.jpg?q=60'
    )
  })
  it('should correctly generate src even if preceding slash is included in prop', async () => {
    expect(
      await browser.elementById('preceding-slash-image').getAttribute('src')
    ).toBe('https://example.com/myaccount/fooslash.jpg')
  })
  it('should add a srcset based on the loader', async () => {
    expect(
      await browser.elementById('basic-image').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/foo.jpg?w=480&q=60 480w, https://example.com/myaccount/foo.jpg?w=1024&q=60 1024w, https://example.com/myaccount/foo.jpg?w=1600&q=60 1600w'
    )
  })
  it('should add a srcset even with preceding slash in prop', async () => {
    expect(
      await browser.elementById('preceding-slash-image').getAttribute('srcset')
    ).toBe(
      'https://example.com/myaccount/fooslash.jpg?w=480 480w, https://example.com/myaccount/fooslash.jpg?w=1024 1024w, https://example.com/myaccount/fooslash.jpg?w=1600 1600w'
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
      'https://example.com/myaccount/foo1.jpg'
    )
    expect(await browser.elementById('lazy-top').getAttribute('srcset')).toBe(
      'https://example.com/myaccount/foo1.jpg?w=480 480w, https://example.com/myaccount/foo1.jpg?w=1024 1024w, https://example.com/myaccount/foo1.jpg?w=1600 1600w'
    )
  })
  it('should not have loaded the second image immediately', async () => {
    expect(
      await browser.elementById('lazy-mid').getAttribute('src')
    ).toBeFalsy()
    expect(
      await browser.elementById('lazy-mid').getAttribute('srcset')
    ).toBeFalsy()
  })
  it('should pass through classes on a lazy loaded image', async () => {
    expect(await browser.elementById('lazy-mid').getAttribute('class')).toBe(
      'exampleclass __lazy'
    )
  })
  it('should load the second image after scrolling down', async () => {
    let viewportHeight = await browser.eval(`window.innerHeight`)
    let topOfMidImage = await browser.eval(
      `document.getElementById('lazy-mid').offsetTop`
    )
    let buffer = 150
    await browser.eval(
      `window.scrollTo(0, ${topOfMidImage - (viewportHeight + buffer)})`
    )
    await waitFor(200)
    expect(await browser.elementById('lazy-mid').getAttribute('src')).toBe(
      'https://example.com/myaccount/foo2.jpg'
    )
    expect(await browser.elementById('lazy-mid').getAttribute('srcset')).toBe(
      'https://example.com/myaccount/foo2.jpg?w=480 480w, https://example.com/myaccount/foo2.jpg?w=1024 1024w, https://example.com/myaccount/foo2.jpg?w=1600 1600w'
    )
  })
  it('should not have loaded the third image after scrolling down', async () => {
    expect(
      await browser.elementById('lazy-bottom').getAttribute('src')
    ).toBeFalsy()
    expect(
      await browser.elementById('lazy-bottom').getAttribute('srcset')
    ).toBeFalsy()
  })
  it('should load the third image, which is unoptimized, after scrolling further down', async () => {
    let viewportHeight = await browser.eval(`window.innerHeight`)
    let topOfBottomImage = await browser.eval(
      `document.getElementById('lazy-bottom').offsetTop`
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
}

async function hasPreloadLinkMatchingUrl(url) {
  const links = await browser.elementsByCss('link')
  let foundMatch = false
  for (const link of links) {
    const rel = await link.getAttribute('rel')
    const href = await link.getAttribute('href')
    if (rel === 'preload' && href === url) {
      foundMatch = true
      break
    }
  }
  return foundMatch
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
          'https://example.com/myaccount/withpriority.png'
        )
      ).toBe(true)
    })
    it('should add a preload tag for a priority image with preceding slash', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://example.com/myaccount/fooslash.jpg'
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
    it('should NOT add a preload tag for a priority image', async () => {
      expect(
        await hasPreloadLinkMatchingUrl(
          'https://example.com/myaccount/withpriorityclient.png'
        )
      ).toBe(false)
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
    beforeAll(async () => {
      browser = await webdriver(appPort, '/lazy')
    })
    afterAll(async () => {
      browser = null
    })
    lazyLoadingTests()
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
  })
})
