/* eslint-env jest */

import {
  assertHasRedbox,
  assertNoRedbox,
  check,
  fetchViaHTTP,
  findPort,
  getRedboxHeader,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  retry,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'
import { existsSync } from 'fs'

const appDir = join(__dirname, '../')

let appPort: number
let app

async function getComputed(browser, id, prop) {
  const val = await browser.eval(`document.getElementById('${id}').${prop}`)
  if (typeof val === 'number') {
    return val
  }
  if (typeof val === 'string') {
    const v = parseInt(val, 10)
    if (isNaN(v)) {
      return val
    }
    return v
  }
  return null
}

async function getComputedStyle(browser, id, prop) {
  return browser.eval(
    `window.getComputedStyle(document.getElementById('${id}')).getPropertyValue('${prop}')`
  )
}

async function getSrc(browser: Awaited<ReturnType<typeof webdriver>>, id: string) {
  const src = await browser.elementById(id).getAttribute('src')
  if (src) {
    const url = new URL(src, `http://localhost:${appPort}`)
    return url.href.slice(url.origin.length)
  }
}

function runTests(mode: 'dev' | 'server') {
  
  it('should load images in localPatterns and block others', async () => {
      const browser = await webdriver(appPort, '/')
      const ids = [
        'does-not-exist',
        'top-level',
        'nested-blocked',
        'nested-assets',
        'nested-assets-query',
        'static-img'
      ]
      const urls = await Promise.all(ids.map(id => getSrc(browser, id)))
      const responses = await Promise.all(urls.map(url => fetchViaHTTP(appPort, url)))
      expect(responses.map(res => res.status)).toStrictEqual([
        400,
        400,
        400,
        200,
        400,
        200,
      ])
    
  })

/*
  if (mode === 'dev') {
    it('should show missing src error', async () => {
      const browser = await webdriver(appPort, '/missing-src')

      await assertNoRedbox(browser)

      await check(async () => {
        return (await browser.log()).map((log) => log.message).join('\n')
      }, /Image is missing required "src" property/gm)
    })

    it('should show invalid src error', async () => {
      const browser = await webdriver(appPort, '/invalid-src')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Invalid src prop (https://google.com/test.png) on `next/image`, hostname "google.com" is not configured under images in your `next.config.js`'
      )
    })

    it('should show invalid src error when protocol-relative', async () => {
      const browser = await webdriver(appPort, '/invalid-src-proto-relative')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Failed to parse src "//assets.example.com/img.jpg" on `next/image`, protocol-relative URL (//) must be changed to an absolute URL (http:// or https://)'
      )
    })

    it('should show invalid src with leading space', async () => {
      const browser = await webdriver(appPort, '/invalid-src-leading-space')
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Image with src " /test.jpg" cannot start with a space or control character.'
      )
    })

    it('should show invalid src with trailing space', async () => {
      const browser = await webdriver(appPort, '/invalid-src-trailing-space')
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Image with src "/test.png " cannot end with a space or control character.'
      )
    })

    it('should show error when string src and placeholder=blur and blurDataURL is missing', async () => {
      const browser = await webdriver(appPort, '/invalid-placeholder-blur')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.png" has "placeholder='blur'" property but is missing the "blurDataURL" property.`
      )
    })

    it('should show error when invalid width prop', async () => {
      const browser = await webdriver(appPort, '/invalid-width')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" property. Expected a numeric value in pixels but received "100%".`
      )
    })

    it('should show error when invalid Infinity width prop', async () => {
      const browser = await webdriver(appPort, '/invalid-Infinity-width')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" property. Expected a numeric value in pixels but received "Infinity".`
      )
    })

    it('should show error when invalid height prop', async () => {
      const browser = await webdriver(appPort, '/invalid-height')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "height" property. Expected a numeric value in pixels but received "50vh".`
      )
    })

    it('should show missing alt error', async () => {
      const browser = await webdriver(appPort, '/missing-alt')

      await assertNoRedbox(browser)

      await check(async () => {
        return (await browser.log()).map((log) => log.message).join('\n')
      }, /Image is missing required "alt" property/gm)
    })

    it('should show error when missing width prop', async () => {
      const browser = await webdriver(appPort, '/missing-width')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" is missing required "width" property.`
      )
    })

    it('should show error when missing height prop', async () => {
      const browser = await webdriver(appPort, '/missing-height')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" is missing required "height" property.`
      )
    })

    it('should show error when width prop on fill image', async () => {
      const browser = await webdriver(appPort, '/invalid-fill-width')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/wide.png" has both "width" and "fill" properties.`
      )
    })

    it('should show error when CSS position changed on fill image', async () => {
      const browser = await webdriver(appPort, '/invalid-fill-position')

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/wide.png" has both "fill" and "style.position" properties. Images with "fill" always use position absolute - it cannot be modified.`
      )
    })

    it('should show error when static import and placeholder=blur and blurDataUrl is missing', async () => {
      const browser = await webdriver(
        appPort,
        '/invalid-placeholder-blur-static'
      )

      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(
        /Image with src "(.*)bmp" has "placeholder='blur'" property but is missing the "blurDataURL" property/
      )
    })

    it('should warn when using a very small image with placeholder=blur', async () => {
      const browser = await webdriver(appPort, '/small-img-import')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await assertNoRedbox(browser)
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) is smaller than 40x40. Consider removing(.*)/gm
      )
    })

    it('should not warn when Image is child of p', async () => {
      const browser = await webdriver(appPort, '/inside-paragraph')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await assertNoRedbox(browser)
      expect(warnings).not.toMatch(
        /Expected server HTML to contain a matching/gm
      )
      expect(warnings).not.toMatch(/cannot appear as a descendant/gm)
    })

    it('should warn when priority prop is missing on LCP image', async () => {
      let browser = await webdriver(appPort, '/priority-missing-warning')
      try {
        // Wait for image to load:
        await check(async () => {
          const result = await browser.eval(
            `document.getElementById('responsive').naturalWidth`
          )
          if (result < 1) {
            throw new Error('Image not ready')
          }
          return 'done'
        }, 'done')
        await waitFor(1000)
        const warnings = (await browser.log())
          .map((log) => log.message)
          .join('\n')
        await assertNoRedbox(browser)
        expect(warnings).toMatch(
          /Image with src (.*)test(.*) was detected as the Largest Contentful Paint/gm
        )
      } finally {
        await browser.close()
      }
    })

    it('should warn when loader is missing width', async () => {
      const browser = await webdriver(appPort, '/invalid-loader')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await assertNoRedbox(browser)
      expect(warnings).toMatch(
        /Image with src (.*)png(.*) has a "loader" property that does not implement width/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)jpg(.*) has a "loader" property that does not implement width/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)webp(.*) has a "loader" property that does not implement width/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)gif(.*) has a "loader" property that does not implement width/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)tiff(.*) has a "loader" property that does not implement width/gm
      )
    })

    it('should not warn when data url image with fill and sizes props', async () => {
      const browser = await webdriver(appPort, '/data-url-with-fill-and-sizes')
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await assertNoRedbox(browser)
      expect(warnings).not.toMatch(
        /Image with src (.*) has "fill" but is missing "sizes" prop. Please add it to improve page performance/gm
      )
    })

    it('should not warn when svg, even if with loader prop or without', async () => {
      const browser = await webdriver(appPort, '/loader-svg')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await assertNoRedbox(browser)
      expect(warnings).not.toMatch(
        /Image with src (.*) has a "loader" property that does not implement width/gm
      )
      expect(await browser.elementById('with-loader').getAttribute('src')).toBe(
        '/test.svg?size=256'
      )
      expect(
        await browser.elementById('with-loader').getAttribute('srcset')
      ).toBe('/test.svg?size=128 1x, /test.svg?size=256 2x')
      expect(
        await browser.elementById('without-loader').getAttribute('src')
      ).toBe('/test.svg')
      expect(
        await browser.elementById('without-loader').getAttribute('srcset')
      ).toBeFalsy()
    })

    it('should warn at most once even after state change', async () => {
      const browser = await webdriver(appPort, '/warning-once')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      await browser.eval(`document.querySelector("button").click()`)
      await browser.eval(`document.querySelector("button").click()`)
      const count = await browser.eval(
        `document.querySelector("button").textContent`
      )
      expect(count).toBe('Count: 2')
      await check(async () => {
        const result = await browser.eval(
          'document.getElementById("w").naturalWidth'
        )
        if (result < 1) {
          throw new Error('Image not loaded')
        }
        return 'done'
      }, 'done')
      await waitFor(1000)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .filter((log) => log.startsWith('Image with src'))
      expect(warnings[0]).toMatch(
        'Image with src "/test.png" was detected as the Largest Contentful Paint (LCP).'
      )
      expect(warnings.length).toBe(1)
    })
  }
  */
}

describe('Image localPatterns config', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('dev')
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('server')
    }
  )
})
