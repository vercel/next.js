/* eslint-env jest */

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  check,
  findPort,
  getRedboxHeader,
  hasRedbox,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 60)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

let appPort
let app

async function hasImageMatchingUrl(browser, url) {
  const links = await browser.elementsByCss('img')
  let foundMatch = false
  for (const link of links) {
    const src = await link.getAttribute('src')
    if (src === url) {
      foundMatch = true
      break
    }
  }
  return foundMatch
}

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

async function getSrc(browser, id) {
  const src = await browser.elementById(id).getAttribute('src')
  if (src) {
    const url = new URL(src)
    return url.href.slice(url.origin.length)
  }
}

function getRatio(width, height) {
  return height / width
}

function runTests(mode) {
  it('should load the images', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result === 0) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      expect(
        await hasImageMatchingUrl(
          browser,
          `http://localhost:${appPort}/_next/image?url=%2Ftest.jpg&w=828&q=75`
        )
      ).toBe(true)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should preload priority images', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/priority')

      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result === 0) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      const links = await browser.elementsByCss('link[rel=preload][as=image]')
      const entries = []
      for (const link of links) {
        const imagesrcset = await link.getAttribute('imagesrcset')
        const imagesizes = await link.getAttribute('imagesizes')
        entries.push({ imagesrcset, imagesizes })
      }
      expect(entries).toEqual([
        {
          imagesizes: null,
          imagesrcset:
            '/_next/image?url=%2Ftest.jpg&w=640&q=75 1x, /_next/image?url=%2Ftest.jpg&w=828&q=75 2x',
        },
        {
          imagesizes: '100vw',
          imagesrcset:
            '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w',
        },
      ])
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should not pass through user-provided srcset (causing a flash)', async () => {
    const html = await renderViaHTTP(appPort, '/drop-srcset')
    const $html = cheerio.load(html)

    const els = [].slice.apply($html('img'))
    expect(els.length).toBe(2)

    const [noscriptEl, el] = els
    expect(noscriptEl.attribs.src).toBeDefined()
    expect(noscriptEl.attribs.srcset).toBeDefined()

    expect(el.attribs.src).toBeDefined()
    expect(el.attribs.srcset).toBeUndefined()
    expect(el.attribs.srcSet).toBeUndefined()
  })

  it('should update the image on src change', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/update')

      await check(
        () => browser.eval(`document.getElementById("update-image").src`),
        /test\.jpg/
      )

      await browser.eval(`document.getElementById("toggle").click()`)

      await check(
        () => browser.eval(`document.getElementById("update-image").src`),
        /test\.png/
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work when using flexbox', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/flex')
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').width`
        )
        if (result === 0) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work with layout-fixed so resizing window does not resize image', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/layout-fixed')
      const width = 1200
      const height = 700
      const delta = 250
      const id = 'fixed1'
      expect(await getSrc(browser, id)).toBe(
        '/_next/image?url=%2Fwide.png&w=3840&q=75'
      )
      expect(await browser.elementById(id).getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=1200&q=75 1x, /_next/image?url=%2Fwide.png&w=3840&q=75 2x'
      )
      expect(await browser.elementById(id).getAttribute('sizes')).toBeFalsy()
      await browser.setDimensions({
        width: width + delta,
        height: height + delta,
      })
      expect(await getComputed(browser, id, 'width')).toBe(width)
      expect(await getComputed(browser, id, 'height')).toBe(height)
      await browser.setDimensions({
        width: width - delta,
        height: height - delta,
      })
      expect(await getComputed(browser, id, 'width')).toBe(width)
      expect(await getComputed(browser, id, 'height')).toBe(height)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work with layout-intrinsic so resizing window maintains image aspect ratio', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/layout-intrinsic')
      const width = 1200
      const height = 700
      const delta = 250
      const id = 'intrinsic1'
      expect(await getSrc(browser, id)).toBe(
        '/_next/image?url=%2Fwide.png&w=3840&q=75'
      )
      expect(await browser.elementById(id).getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=1200&q=75 1x, /_next/image?url=%2Fwide.png&w=3840&q=75 2x'
      )
      expect(await browser.elementById(id).getAttribute('sizes')).toBeFalsy()
      await browser.setDimensions({
        width: width + delta,
        height: height + delta,
      })
      expect(await getComputed(browser, id, 'width')).toBe(width)
      expect(await getComputed(browser, id, 'height')).toBe(height)
      await browser.setDimensions({
        width: width - delta,
        height: height - delta,
      })
      const newWidth = await getComputed(browser, id, 'width')
      const newHeight = await getComputed(browser, id, 'height')
      expect(newWidth).toBeLessThan(width)
      expect(newHeight).toBeLessThan(height)
      expect(getRatio(newWidth, newHeight)).toBeCloseTo(
        getRatio(width, height),
        1
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work with layout-responsive so resizing window maintains image aspect ratio', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/layout-responsive')
      const width = 1200
      const height = 700
      const delta = 250
      const id = 'responsive1'
      expect(await getSrc(browser, id)).toBe(
        '/_next/image?url=%2Fwide.png&w=3840&q=75'
      )
      expect(await browser.elementById(id).getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
      )
      expect(await browser.elementById(id).getAttribute('sizes')).toBe('100vw')
      await browser.setDimensions({
        width: width + delta,
        height: height + delta,
      })
      expect(await getComputed(browser, id, 'width')).toBeGreaterThan(width)
      expect(await getComputed(browser, id, 'height')).toBeGreaterThan(height)
      await browser.setDimensions({
        width: width - delta,
        height: height - delta,
      })
      const newWidth = await getComputed(browser, id, 'width')
      const newHeight = await getComputed(browser, id, 'height')
      expect(newWidth).toBeLessThan(width)
      expect(newHeight).toBeLessThan(height)
      expect(getRatio(newWidth, newHeight)).toBeCloseTo(
        getRatio(width, height),
        1
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work with layout-fill to fill the parent but NOT stretch with viewport', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/layout-fill')
      const width = 600
      const height = 350
      const delta = 150
      const id = 'fill1'
      expect(await getSrc(browser, id)).toBe(
        '/_next/image?url=%2Fwide.png&w=3840&q=75'
      )
      expect(await browser.elementById(id).getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
      )
      expect(await browser.elementById(id).getAttribute('sizes')).toBe('100vw')
      await browser.setDimensions({
        width: width + delta,
        height: height + delta,
      })
      expect(await getComputed(browser, id, 'width')).toBe(width)
      expect(await getComputed(browser, id, 'height')).toBe(height)
      await browser.setDimensions({
        width: width - delta,
        height: height - delta,
      })
      const newWidth = await getComputed(browser, id, 'width')
      const newHeight = await getComputed(browser, id, 'height')
      expect(newWidth).toBe(width)
      expect(newHeight).toBe(height)
      expect(getRatio(newWidth, newHeight)).toBeCloseTo(
        getRatio(width, height),
        1
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work with layout-fill to fill the parent and stretch with viewport', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/layout-fill')
      const id = 'fill2'
      const width = await getComputed(browser, id, 'width')
      const height = await getComputed(browser, id, 'height')
      await browser.eval(`document.getElementById("${id}").scrollIntoView()`)
      expect(await getSrc(browser, id)).toBe(
        '/_next/image?url=%2Fwide.png&w=3840&q=75'
      )
      expect(await browser.elementById(id).getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
      )
      expect(await browser.elementById(id).getAttribute('sizes')).toBe('100vw')
      expect(await getComputed(browser, id, 'width')).toBe(width)
      expect(await getComputed(browser, id, 'height')).toBe(height)
      const delta = 150
      const largeWidth = width + delta
      const largeHeight = height + delta
      await browser.setDimensions({
        width: largeWidth,
        height: largeHeight,
      })
      expect(await getComputed(browser, id, 'width')).toBe(largeWidth)
      expect(await getComputed(browser, id, 'height')).toBe(largeHeight)
      const smallWidth = width - delta
      const smallHeight = height - delta
      await browser.setDimensions({
        width: smallWidth,
        height: smallHeight,
      })
      expect(await getComputed(browser, id, 'width')).toBe(smallWidth)
      expect(await getComputed(browser, id, 'height')).toBe(smallHeight)

      const objectFit = await browser.eval(
        `document.getElementById("${id}").style.objectFit`
      )
      const objectPosition = await browser.eval(
        `document.getElementById("${id}").style.objectPosition`
      )
      expect(objectFit).toBe('cover')
      expect(objectPosition).toBe('left center')
      await browser.eval(`document.getElementById("fill3").scrollIntoView()`)
      expect(await browser.elementById('fill3').getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=256&q=75 256w, /_next/image?url=%2Fwide.png&w=384&q=75 384w, /_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
      )
      await browser.eval(`document.getElementById("fill4").scrollIntoView()`)
      expect(await browser.elementById('fill4').getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=16&q=75 16w, /_next/image?url=%2Fwide.png&w=32&q=75 32w, /_next/image?url=%2Fwide.png&w=48&q=75 48w, /_next/image?url=%2Fwide.png&w=64&q=75 64w, /_next/image?url=%2Fwide.png&w=96&q=75 96w, /_next/image?url=%2Fwide.png&w=128&q=75 128w, /_next/image?url=%2Fwide.png&w=256&q=75 256w, /_next/image?url=%2Fwide.png&w=384&q=75 384w, /_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work with sizes and automatically use layout-responsive', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/sizes')
      const width = 1200
      const height = 700
      const delta = 250
      const id = 'sizes1'
      expect(await getSrc(browser, id)).toBe(
        '/_next/image?url=%2Fwide.png&w=3840&q=75'
      )
      expect(await browser.elementById(id).getAttribute('srcset')).toBe(
        '/_next/image?url=%2Fwide.png&w=16&q=75 16w, /_next/image?url=%2Fwide.png&w=32&q=75 32w, /_next/image?url=%2Fwide.png&w=48&q=75 48w, /_next/image?url=%2Fwide.png&w=64&q=75 64w, /_next/image?url=%2Fwide.png&w=96&q=75 96w, /_next/image?url=%2Fwide.png&w=128&q=75 128w, /_next/image?url=%2Fwide.png&w=256&q=75 256w, /_next/image?url=%2Fwide.png&w=384&q=75 384w, /_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
      )
      expect(await browser.elementById(id).getAttribute('sizes')).toBe(
        '(max-width: 2048px) 1200px, 3840px'
      )
      await browser.setDimensions({
        width: width + delta,
        height: height + delta,
      })
      expect(await getComputed(browser, id, 'width')).toBeGreaterThan(width)
      expect(await getComputed(browser, id, 'height')).toBeGreaterThan(height)
      await browser.setDimensions({
        width: width - delta,
        height: height - delta,
      })
      const newWidth = await getComputed(browser, id, 'width')
      const newHeight = await getComputed(browser, id, 'height')
      expect(newWidth).toBeLessThan(width)
      expect(newHeight).toBeLessThan(height)
      expect(getRatio(newWidth, newHeight)).toBeCloseTo(
        getRatio(width, height),
        1
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  if (mode === 'dev') {
    it('should show missing src error', async () => {
      const browser = await webdriver(appPort, '/missing-src')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        'Image is missing required "src" property. Make sure you pass "src" in props to the `next/image` component. Received: {"width":200}'
      )
    })

    it('should show invalid src error', async () => {
      const browser = await webdriver(appPort, '/invalid-src')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        'Invalid src prop (https://google.com/test.png) on `next/image`, hostname "google.com" is not configured under images in your `next.config.js`'
      )
    })

    it('should show invalid src error when protocol-relative', async () => {
      const browser = await webdriver(appPort, '/invalid-src-proto-relative')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        'Failed to parse src "//assets.example.com/img.jpg" on `next/image`, protocol-relative URL (//) must be changed to an absolute URL (http:// or https://)'
      )
    })
  }

  it('should correctly ignore prose styles', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/prose')

      const id = 'prose-image'

      // Wait for image to load:
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById(${JSON.stringify(id)}).naturalWidth`
        )

        if (result < 1) {
          throw new Error('Image not ready')
        }

        return 'result-correct'
      }, /result-correct/)

      await waitFor(1000)

      const computedWidth = await getComputed(browser, id, 'width')
      const computedHeight = await getComputed(browser, id, 'height')
      expect(getRatio(computedWidth, computedHeight)).toBeCloseTo(1, 1)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  // Tests that use the `unsized` attribute:
  if (mode !== 'dev') {
    it('should correctly rotate image', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/rotated')

        const id = 'exif-rotation-image'

        // Wait for image to load:
        await check(async () => {
          const result = await browser.eval(
            `document.getElementById(${JSON.stringify(id)}).naturalWidth`
          )

          if (result < 1) {
            throw new Error('Image not ready')
          }

          return 'result-correct'
        }, /result-correct/)

        await waitFor(1000)

        const computedWidth = await getComputed(browser, id, 'width')
        const computedHeight = await getComputed(browser, id, 'height')
        expect(getRatio(computedWidth, computedHeight)).toBeCloseTo(0.5625, 1)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  }
}

describe('Image Component Tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          experimental: {
            enableStaticImages: true
          },
        }
      `
      )
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await fs.unlink(nextConfig)
      await killApp(app)
    })

    runTests('dev')
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          experimental: {
            enableStaticImages: true
          },
        }
      `
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.unlink(nextConfig)
      await killApp(app)
    })

    runTests('server')
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless',
          experimental: {
            enableBlurryPlaceholder: true,
            enableStaticImages: true
          },
        }
      `
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.unlink(nextConfig)
      await killApp(app)
    })

    it('should have blurry placeholder when enabled', async () => {
      const html = await renderViaHTTP(appPort, '/blurry-placeholder')
      expect(html).toContain(
        'background-image:url(&quot;data:image/svg+xml,%3Csvg xmlns=&#x27;http://www.w3.org/2000/svg&#x27; width=&#x27;400&#x27; height=&#x27;400&#x27; viewBox=&#x27;0 0 400 400&#x27;%3E%3Cfilter id=&#x27;blur&#x27; filterUnits=&#x27;userSpaceOnUse&#x27; color-interpolation-filters=&#x27;sRGB&#x27;%3E%3CfeGaussianBlur stdDeviation=&#x27;20&#x27; edgeMode=&#x27;duplicate&#x27; /%3E%3CfeComponentTransfer%3E%3CfeFuncA type=&#x27;discrete&#x27; tableValues=&#x27;1 1&#x27; /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter=&#x27;url(%23blur)&#x27; href=&#x27;data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==&#x27; x=&#x27;0&#x27; y=&#x27;0&#x27; height=&#x27;100%25&#x27; width=&#x27;100%25&#x27;/%3E%3C/svg%3E&quot;)'
      )
    })

    it('should remove blurry placeholder after image loads', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/blurry-placeholder')
        const id = 'blurry-placeholder'
        const backgroundImage = await browser.eval(
          `window.getComputedStyle(document.getElementById('${id}')).getPropertyValue('background-image')`
        )
        expect(backgroundImage).toBe('none')
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    runTests('serverless')
  })
})
