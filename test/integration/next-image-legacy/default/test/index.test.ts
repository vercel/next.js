/* eslint-env jest */

import cheerio from 'cheerio'
import validateHTML from 'html-validator'
import {
  check,
  fetchViaHTTP,
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
import { existsSync } from 'fs'

const appDir = join(__dirname, '../')

let appPort
let app

async function hasImageMatchingUrl(browser, url) {
  const links = await browser.elementsByCss('img')
  let foundMatch = false
  for (const link of links) {
    const src = await link.getAttribute('src')
    if (new URL(src, `http://localhost:${appPort}`).toString() === url) {
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

async function getComputedStyle(browser, id, prop) {
  return browser.eval(
    `window.getComputedStyle(document.getElementById('${id}')).getPropertyValue('${prop}')`
  )
}

async function getSrc(browser, id) {
  const src = await browser.elementById(id).getAttribute('src')
  if (src) {
    const url = new URL(src, `http://localhost:${appPort}`)
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
          imagesizes: '',
          imagesrcset:
            '/_next/image?url=%2Ftest.jpg&w=640&q=75 1x, /_next/image?url=%2Ftest.jpg&w=828&q=75 2x',
        },
        {
          imagesizes: '',
          imagesrcset:
            '/_next/image?url=%2Ftest.png&w=640&q=75 1x, /_next/image?url=%2Ftest.png&w=828&q=75 2x',
        },
        {
          imagesizes: '100vw',
          imagesrcset:
            '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w',
        },
      ])

      // When priority={true}, we should _not_ set loading="lazy"
      expect(
        await browser.elementById('basic-image').getAttribute('loading')
      ).toBe(null)
      expect(
        await browser
          .elementById('basic-image-with-crossorigin')
          .getAttribute('loading')
      ).toBe(null)
      expect(
        await browser
          .elementById('basic-image-with-referrerpolicy')
          .getAttribute('loading')
      ).toBe(null)
      expect(
        await browser.elementById('load-eager').getAttribute('loading')
      ).toBe(null)
      expect(
        await browser.elementById('responsive1').getAttribute('loading')
      ).toBe(null)
      expect(
        await browser.elementById('responsive2').getAttribute('loading')
      ).toBe(null)

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(warnings).not.toMatch(
        /was detected as the Largest Contentful Paint/gm
      )

      // should preload with crossorigin
      expect(
        await browser.elementsByCss(
          'link[rel=preload][as=image][crossorigin=anonymous][imagesrcset*="test.jpg"]'
        )
      ).toHaveLength(1)

      // should preload with referrerpolicy
      expect(
        await browser.elementsByCss(
          'link[rel=preload][as=image][referrerpolicy="no-referrer"][imagesrcset*="test.png"]'
        )
      ).toHaveLength(1)
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

    const [el, noscriptEl] = els
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

  it('should callback onLoadingComplete when image is fully loaded', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/on-loading-complete')

      await browser.eval(
        `document.getElementById("footer").scrollIntoView({behavior: "smooth"})`
      )

      await check(
        () => browser.eval(`document.getElementById("img1").currentSrc`),
        /test(.*)jpg/
      )
      await check(
        () => browser.eval(`document.getElementById("img2").currentSrc`),
        /test(.*).png/
      )
      await check(
        () => browser.eval(`document.getElementById("img3").currentSrc`),
        /test\.svg/
      )
      await check(
        () => browser.eval(`document.getElementById("img4").currentSrc`),
        /test(.*)ico/
      )
      await check(
        () => browser.eval(`document.getElementById("msg1").textContent`),
        'loaded 1 img1 with dimensions 128x128'
      )
      await check(
        () => browser.eval(`document.getElementById("msg2").textContent`),
        'loaded 1 img2 with dimensions 400x400'
      )
      await check(
        () => browser.eval(`document.getElementById("msg3").textContent`),
        'loaded 1 img3 with dimensions 266x266'
      )
      await check(
        () => browser.eval(`document.getElementById("msg4").textContent`),
        'loaded 1 img4 with dimensions 21x21'
      )
      await check(
        () => browser.eval(`document.getElementById("msg5").textContent`),
        'loaded 1 img5 with dimensions 3x5'
      )
      await check(
        () => browser.eval(`document.getElementById("msg6").textContent`),
        'loaded 1 img6 with dimensions 3x5'
      )
      await check(
        () => browser.eval(`document.getElementById("msg7").textContent`),
        'loaded 1 img7 with dimensions 400x400'
      )
      await check(
        () => browser.eval(`document.getElementById("msg8").textContent`),
        'loaded 1 img8 with dimensions 640x373'
      )
      await check(
        () =>
          browser.eval(
            `document.getElementById("img8").getAttribute("data-nimg")`
          ),
        'intrinsic'
      )
      await check(
        () => browser.eval(`document.getElementById("img8").currentSrc`),
        /wide.png/
      )
      await browser.eval('document.getElementById("toggle").click()')
      await check(
        () => browser.eval(`document.getElementById("msg8").textContent`),
        'loaded 2 img8 with dimensions 400x300'
      )
      await check(
        () =>
          browser.eval(
            `document.getElementById("img8").getAttribute("data-nimg")`
          ),
        'fixed'
      )
      await check(
        () => browser.eval(`document.getElementById("img8").currentSrc`),
        /test-rect.jpg/
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should callback native onLoad in most cases', async () => {
    let browser = await webdriver(appPort, '/on-load')

    await browser.eval(
      `document.getElementById("footer").scrollIntoView({behavior: "smooth"})`
    )

    await check(
      () => browser.eval(`document.getElementById("img1").currentSrc`),
      /test(.*)jpg/
    )
    await check(
      () => browser.eval(`document.getElementById("img2").currentSrc`),
      /test(.*).png/
    )
    await check(
      () => browser.eval(`document.getElementById("img3").currentSrc`),
      /test\.svg/
    )
    await check(
      () => browser.eval(`document.getElementById("img4").currentSrc`),
      /test(.*)ico/
    )
    await check(
      () => browser.eval(`document.getElementById("msg1").textContent`),
      'loaded 1 img1 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'loaded 1 img2 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg3").textContent`),
      'loaded 1 img3 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg4").textContent`),
      'loaded 1 img4 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg8").textContent`),
      'loaded 1 img8 with native onLoad'
    )
    await check(
      () =>
        browser.eval(
          `document.getElementById("img8").getAttribute("data-nimg")`
        ),
      'intrinsic'
    )
    await check(
      () => browser.eval(`document.getElementById("img8").currentSrc`),
      /wide.png/
    )
    await browser.eval('document.getElementById("toggle").click()')
    // The normal `onLoad()` is triggered by lazy placeholder image
    // so ideally this would be "2" instead of "3" count
    await check(
      () => browser.eval(`document.getElementById("msg8").textContent`),
      'loaded 3 img8 with native onLoad'
    )
    await check(
      () =>
        browser.eval(
          `document.getElementById("img8").getAttribute("data-nimg")`
        ),
      'fixed'
    )
    await check(
      () => browser.eval(`document.getElementById("img8").currentSrc`),
      /test-rect.jpg/
    )
  })

  it('should callback native onError when error occured while loading image', async () => {
    let browser = await webdriver(appPort, '/on-error')

    await check(
      () => browser.eval(`document.getElementById("img1").currentSrc`),
      /test\.png/
    )
    await check(
      () => browser.eval(`document.getElementById("img2").currentSrc`),
      //This is an empty data url
      /nonexistent-img\.png/
    )
    await check(
      () => browser.eval(`document.getElementById("msg1").textContent`),
      'no error occured'
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'error occured while loading img2'
    )
  })

  it('should work with image with blob src', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/blob')

      await check(
        () => browser.eval(`document.getElementById("blob-image").src`),
        /^blob:/
      )
      await check(
        () => browser.eval(`document.getElementById("blob-image").srcset`),
        ''
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

      await check(async () => {
        expect(await getSrc(browser, id)).toBe(
          '/_next/image?url=%2Fwide.png&w=3840&q=75'
        )
        return 'success'
      }, 'success')
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

      await check(async () => {
        expect(await getSrc(browser, id)).toBe(
          '/_next/image?url=%2Fwide.png&w=3840&q=75'
        )
        return 'success'
      }, 'success')
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

      await check(async () => {
        expect(await getSrc(browser, id)).toBe(
          '/_next/image?url=%2Fwide.png&w=3840&q=75'
        )
        return 'success'
      }, 'success')
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

      await check(async () => {
        expect(await getSrc(browser, id)).toBe(
          '/_next/image?url=%2Fwide.png&w=3840&q=75'
        )
        return 'success'
      }, 'success')
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

      await check(async () => {
        expect(await getSrc(browser, id)).toBe(
          '/_next/image?url=%2Fwide.png&w=3840&q=75'
        )
        return 'success'
      }, 'success')

      await check(() => {
        return browser.eval(
          `document.querySelector('#${id}').getAttribute('srcset')`
        )
      }, '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w')

      expect(await browser.elementById(id).getAttribute('sizes')).toBe('100vw')
      expect(await getComputed(browser, id, 'width')).toBe(width)
      expect(await getComputed(browser, id, 'height')).toBe(height)
      const delta = 150
      const largeWidth = Number(width) + delta
      const largeHeight = Number(height) + delta
      await browser.setDimensions({
        width: largeWidth,
        height: largeHeight,
      })
      expect(await getComputed(browser, id, 'width')).toBe(largeWidth)
      expect(await getComputed(browser, id, 'height')).toBe(largeHeight)
      const smallWidth = Number(width) - delta
      const smallHeight = Number(height) - delta
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
      await check(() => {
        return browser.eval(
          `document.querySelector('#fill3').getAttribute('srcset')`
        )
      }, '/_next/image?url=%2Fwide.png&w=256&q=75 256w, /_next/image?url=%2Fwide.png&w=384&q=75 384w, /_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w')

      await browser.eval(`document.getElementById("fill4").scrollIntoView()`)
      await check(() => {
        return browser.eval(
          `document.querySelector('#fill4').getAttribute('srcset')`
        )
      }, '/_next/image?url=%2Fwide.png&w=16&q=75 16w, /_next/image?url=%2Fwide.png&w=32&q=75 32w, /_next/image?url=%2Fwide.png&w=48&q=75 48w, /_next/image?url=%2Fwide.png&w=64&q=75 64w, /_next/image?url=%2Fwide.png&w=96&q=75 96w, /_next/image?url=%2Fwide.png&w=128&q=75 128w, /_next/image?url=%2Fwide.png&w=256&q=75 256w, /_next/image?url=%2Fwide.png&w=384&q=75 384w, /_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w')
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

      await check(async () => {
        expect(await getSrc(browser, id)).toBe(
          '/_next/image?url=%2Fwide.png&w=3840&q=75'
        )
        return 'success'
      }, 'success')
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

  it('should handle the styles prop appropriately', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/style-prop')

      expect(
        await browser.elementById('with-styles').getAttribute('style')
      ).toBe(
        'border-radius:10px;padding:0;position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%'
      )
      expect(
        await browser
          .elementById('with-overlapping-styles-intrinsic')
          .getAttribute('style')
      ).toBe(
        'width:0;border-radius:10px;margin:auto;position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;display:block;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%'
      )

      expect(
        await browser
          .elementById('without-styles-responsive')
          .getAttribute('style')
      ).toBe(
        'position:absolute;top:0;left:0;bottom:0;right:0;box-sizing:border-box;padding:0;border:none;margin:auto;display:block;width:0;height:0;min-width:100%;max-width:100%;min-height:100%;max-height:100%'
      )

      if (mode === 'dev') {
        await waitFor(1000)
        const warnings = (await browser.log())
          .map((log) => log.message)
          .join('\n')
        expect(warnings).toMatch(
          /Image with src \/test.png is assigned the following styles, which are overwritten by automatically-generated styles: padding/gm
        )
        expect(warnings).toMatch(
          /Image with src \/test.jpg is assigned the following styles, which are overwritten by automatically-generated styles: width, margin/gm
        )
        expect(warnings).not.toMatch(
          /Image with src \/test.webp is assigned the following styles/gm
        )
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  if (mode === 'dev') {
    it('should show missing src error', async () => {
      const browser = await webdriver(appPort, '/missing-src')

      expect(await hasRedbox(browser)).toBe(false)

      await check(async () => {
        return (await browser.log()).map((log) => log.message).join('\n')
      }, /Image is missing required "src" property/gm)
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

    it('should show error when string src and placeholder=blur and blurDataURL is missing', async () => {
      const browser = await webdriver(appPort, '/invalid-placeholder-blur')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.png" has "placeholder='blur'" property but is missing the "blurDataURL" property.`
      )
    })

    it('should show error when not numeric string width or height', async () => {
      const browser = await webdriver(appPort, '/invalid-width-or-height')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" or "height" property. These should be numeric values.`
      )
    })

    it('should show error when static import and placeholder=blur and blurDataUrl is missing', async () => {
      const browser = await webdriver(
        appPort,
        '/invalid-placeholder-blur-static'
      )

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toMatch(
        /Image with src "(.*)bmp" has "placeholder='blur'" property but is missing the "blurDataURL" property/
      )
    })

    it('should warn when img with layout=responsive is inside flex container', async () => {
      const browser = await webdriver(appPort, '/layout-responsive-inside-flex')
      await browser.eval(`document.getElementById("img").scrollIntoView()`)
      await check(async () => {
        return (await browser.log()).map((log) => log.message).join('\n')
      }, /Image with src (.*)jpg(.*) may not render properly as a child of a flex container. Consider wrapping the image with a div to configure the width/gm)
      expect(await hasRedbox(browser)).toBe(false)
    })

    it('should warn when img with layout=fill is inside a container without position relative', async () => {
      const browser = await webdriver(
        appPort,
        '/layout-fill-inside-nonrelative'
      )
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      await waitFor(1000)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) may not render properly with a parent using position:"static". Consider changing the parent style to position:"relative"/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)png(.*) may not render properly/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)avif(.*) may not render properly/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)webp(.*) may not render properly/gm
      )
      expect(await hasRedbox(browser)).toBe(false)
    })

    it('should warn when using a very small image with placeholder=blur', async () => {
      const browser = await webdriver(appPort, '/small-img-import')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) is smaller than 40x40. Consider removing(.*)/gm
      )
    })

    it('should not warn when Image is child of p', async () => {
      const browser = await webdriver(appPort, '/inside-paragraph')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
      expect(warnings).not.toMatch(
        /Expected server HTML to contain a matching/gm
      )
      expect(warnings).not.toMatch(/cannot appear as a descendant/gm)
    })

    it('should warn when priority prop is missing on LCP image', async () => {
      let browser
      try {
        browser = await webdriver(appPort, '/priority-missing-warning')
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
        expect(await hasRedbox(browser)).toBe(false)
        expect(warnings).toMatch(
          /Image with src (.*)wide.png(.*) was detected as the Largest Contentful Paint/gm
        )
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should warn when loader is missing width', async () => {
      const browser = await webdriver(appPort, '/invalid-loader')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
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

    it('should warn when using sizes with incorrect layout', async () => {
      const browser = await webdriver(appPort, '/invalid-sizes')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
      expect(warnings).toMatch(
        /Image with src (.*)png(.*) has "sizes" property but it will be ignored/gm
      )
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) has "sizes" property but it will be ignored/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)webp(.*) has "sizes" property but it will be ignored/gm
      )
      expect(warnings).not.toMatch(
        /Image with src (.*)gif(.*) has "sizes" property but it will be ignored/gm
      )
    })

    it('should not warn when svg, even if with loader prop or without', async () => {
      const browser = await webdriver(appPort, '/loader-svg')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
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
      ).toBe('/test.svg 1x, /test.svg 2x')
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
        'Image with src "/test.png" has "sizes" property but it will be ignored.'
      )
      expect(warnings[1]).toMatch(
        'Image with src "/test.png" was detected as the Largest Contentful Paint (LCP).'
      )
      expect(warnings.length).toBe(2)
    })
  } else {
    //server-only tests
    it('should not create an image folder in server/chunks', async () => {
      expect(
        existsSync(join(appDir, '.next/server/chunks/static/media'))
      ).toBeFalsy()
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

  it('should apply style inheritance for img elements but not wrapper elements', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/style-inheritance')

      await browser.eval(
        `document.querySelector("footer").scrollIntoView({behavior: "smooth"})`
      )

      const imagesWithIds = await browser.eval(`
        function foo() {
          const imgs = document.querySelectorAll("img[id]");
          for (let img of imgs) {
            const br = window.getComputedStyle(img).getPropertyValue("border-radius");
            if (!br) return 'no-border-radius';
            if (br !== '139px') return br;
          }
          return true;
        }()
      `)
      expect(imagesWithIds).toBe(true)

      const allSpans = await browser.eval(`
        function foo() {
          const spans = document.querySelectorAll("span");
          for (let span of spans) {
            const m = window.getComputedStyle(span).getPropertyValue("margin");
            if (m && m !== '0px') return m;
          }
          return false;
        }()
      `)
      expect(allSpans).toBe(false)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should apply filter style after image loads', async () => {
    const browser = await webdriver(appPort, '/style-filter')
    await check(() => getSrc(browser, 'img-plain'), /^\/_next\/image/)
    await check(() => getSrc(browser, 'img-blur'), /^\/_next\/image/)
    await waitFor(1000)

    expect(await getComputedStyle(browser, 'img-plain', 'filter')).toBe(
      'opacity(0.5)'
    )
    expect(
      await getComputedStyle(browser, 'img-plain', 'background-size')
    ).toBe('30%')
    expect(
      await getComputedStyle(browser, 'img-plain', 'background-image')
    ).toMatch('iVBORw0KGgo=')
    expect(
      await getComputedStyle(browser, 'img-plain', 'background-position')
    ).toBe('1px 2px')

    expect(await getComputedStyle(browser, 'img-blur', 'filter')).toBe(
      'opacity(0.5)'
    )
    expect(await getComputedStyle(browser, 'img-blur', 'background-size')).toBe(
      '30%'
    )
    expect(
      await getComputedStyle(browser, 'img-blur', 'background-image')
    ).toMatch('iVBORw0KGgo=')
    expect(
      await getComputedStyle(browser, 'img-blur', 'background-position')
    ).toBe('1px 2px')
  })

  it('should emit image for next/dynamic with non ssr case', async () => {
    let browser = await webdriver(appPort, '/dynamic-static-img')
    const img = await browser.elementById('dynamic-loaded-static-jpg')
    const src = await img.getAttribute('src')
    const { status } = await fetchViaHTTP(appPort, src)
    expect(status).toBe(200)
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

  it('should have blurry placeholder when enabled', async () => {
    const html = await renderViaHTTP(appPort, '/blurry-placeholder')
    const $html = cheerio.load(html)

    $html('noscript > img').attr('id', 'unused')

    expect($html('#blurry-placeholder')[0].attribs.style).toContain(
      `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cfilter id='blur' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20' edgeMode='duplicate' /%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1' /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23blur)' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==' x='0' y='0' height='100%25' width='100%25'/%3E%3C/svg%3E")`
    )

    expect($html('#blurry-placeholder')[0].attribs.style).toContain(
      `background-position:0% 0%`
    )

    expect(
      $html('#blurry-placeholder-tall-centered')[0].attribs.style
    ).toContain(`background-position:center`)

    expect($html('#blurry-placeholder-with-lazy')[0].attribs.style).toContain(
      `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cfilter id='blur' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20' edgeMode='duplicate' /%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1' /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23blur)' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==' x='0' y='0' height='100%25' width='100%25'/%3E%3C/svg%3E")`
    )
  })

  it('should not use blurry placeholder for <noscript> image', async () => {
    const html = await renderViaHTTP(appPort, '/blurry-placeholder')
    const $html = cheerio.load(html)
    const style = $html('noscript > img')[0].attribs.style

    expect(style).not.toContain(`background-position`)
    expect(style).not.toContain(`background-size`)
    expect(style).not.toContain(
      `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cfilter id='blur' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20' edgeMode='duplicate' /%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1' /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23blur)' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==' x='0' y='0' height='100%25' width='100%25'/%3E%3C/svg%3E")`
    )
  })

  it('should remove blurry placeholder after image loads', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/blurry-placeholder')
      await check(
        async () =>
          await getComputedStyle(
            browser,
            'blurry-placeholder',
            'background-image'
          ),
        'none'
      )

      expect(
        await getComputedStyle(
          browser,
          'blurry-placeholder-with-lazy',
          'background-image'
        )
      ).toBe(
        `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cfilter id='blur' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20' edgeMode='duplicate' /%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1' /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23blur)' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==' x='0' y='0' height='100%25' width='100%25'/%3E%3C/svg%3E")`
      )

      await browser.eval('document.getElementById("spacer").remove()')

      await check(
        async () =>
          await getComputedStyle(
            browser,
            'blurry-placeholder-with-lazy',
            'background-image'
          ),
        'none'
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should re-lazyload images after src changes', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/lazy-src-change')
      // image should not be loaded as it is out of viewport
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result >= 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      // Move image into viewport
      await browser.eval(
        'document.getElementById("spacer").style.display = "none"'
      )

      // image should be loaded by now
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result < 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      await check(
        () => browser.eval(`document.getElementById("basic-image").currentSrc`),
        /test\.jpg/
      )

      // Make image out of viewport again
      await browser.eval(
        'document.getElementById("spacer").style.display = "block"'
      )
      // Toggle image's src
      await browser.eval(
        'document.getElementById("button-change-image-src").click()'
      )
      // "new" image should be lazy loaded
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result >= 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      // Move image into viewport again
      await browser.eval(
        'document.getElementById("spacer").style.display = "none"'
      )
      // "new" image should be loaded by now
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result < 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      await check(
        () => browser.eval(`document.getElementById("basic-image").currentSrc`),
        /test\.png/
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should initially load only two of four images using lazyroot', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/lazy-withref')
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('myImage1').naturalWidth`
        )

        if (result >= 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('myImage4').naturalWidth`
        )

        if (result >= 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('myImage2').naturalWidth`
        )

        if (result < 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('myImage3').naturalWidth`
        )

        if (result < 400) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      expect(
        await hasImageMatchingUrl(
          browser,
          `http://localhost:${appPort}/_next/image?url=%2Ftest.jpg&w=828&q=75`
        )
      ).toBe(false)
      expect(
        await hasImageMatchingUrl(
          browser,
          `http://localhost:${appPort}/_next/image?url=%2Ftest.png&w=828&q=75`
        )
      ).toBe(true)
      expect(
        await hasImageMatchingUrl(
          browser,
          `http://localhost:${appPort}/test.svg`
        )
      ).toBe(true)
      expect(
        await hasImageMatchingUrl(
          browser,
          `http://localhost:${appPort}/_next/image?url=%2Ftest.webp&w=828&q=75`
        )
      ).toBe(false)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should be valid HTML', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/valid-html-w3c')
      await waitFor(1000)
      expect(await browser.hasElementByCssSelector('img')).toBeTruthy()
      const url = await browser.url()
      const result = (await validateHTML({
        url,
        format: 'json',
        isLocal: true,
        validator: 'whatwg',
      })) as any
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}

describe('Image Component Tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests('dev')
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    runTests('server')
  })
})
