/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  check,
  hasRedbox,
  getRedboxHeader,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fs from 'fs-extra'

jest.setTimeout(1000 * 30)

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
    return parseInt(val, 10)
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
          `http://localhost:${appPort}/_next/image?url=%2Ftest.jpg&w=1200&q=75`
        )
      ).toBe(true)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
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
      expect(await browser.elementById(id).getAttribute('sizes')).toBe(
        '(max-width: 640px) 640px, (max-width: 750px) 750px, (max-width: 828px) 828px, (max-width: 1080px) 1080px, (max-width: 1200px) 1200px, (max-width: 1920px) 1920px, (max-width: 2048px) 2048px, 3840px'
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
      expect(await browser.elementById(id).getAttribute('sizes')).toBe(
        '(max-width: 640px) 640px, (max-width: 750px) 750px, (max-width: 828px) 828px, (max-width: 1080px) 1080px, (max-width: 1200px) 1200px, (max-width: 1920px) 1920px, (max-width: 2048px) 2048px, 3840px'
      )
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
      expect(await browser.elementById(id).getAttribute('sizes')).toBe(
        '(max-width: 640px) 640px, (max-width: 750px) 750px, (max-width: 828px) 828px, (max-width: 1080px) 1080px, (max-width: 1200px) 1200px, (max-width: 1920px) 1920px, (max-width: 2048px) 2048px, 3840px'
      )
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
        '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
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

      await hasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Image is missing required "src" property. Make sure you pass "src" in props to the `next/image` component. Received: {"width":200}'
      )
    })

    it('should show invalid src error', async () => {
      const browser = await webdriver(appPort, '/invalid-src')

      await hasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Invalid src prop (https://google.com/test.png) on `next/image`, hostname "google.com" is not configured under images in your `next.config.js`'
      )
    })

    it('should show invalid src error when protocol-relative', async () => {
      const browser = await webdriver(appPort, '/invalid-src-proto-relative')

      await hasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Failed to parse src "//assets.example.com/img.jpg" on `next/image`, protocol-relative URL (//) must be changed to an absolute URL (http:// or https://)'
      )
    })

    it('should show invalid unsized error', async () => {
      const browser = await webdriver(appPort, '/invalid-unsized')

      await hasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Image with src "/test.png" has deprecated "unsized" property, which was removed in favor of the "layout=\'fill\'" property'
      )
    })
  }

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
        expect(getRatio(computedWidth, computedHeight)).toBeCloseTo(1.333, 1)
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
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('server')
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless'
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

    runTests('serverless')
  })
})
