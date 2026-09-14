import cheerio from 'cheerio'
import validateHTML from 'html-validator'
import { nextTestSetup, isNextDev } from 'e2e-utils'
import {
  waitForRedbox,
  waitForNoRedbox,
  getRedboxHeader,
  retry,
} from 'next-test-utils'

describe('Image Component Tests', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let dpl: string
  beforeAll(() => {
    dpl = next.getDeploymentIdQuery(true)
  })

  async function getImageUrls(browser) {
    return await Promise.all(
      (await browser.elementsByCss('img')).map(async (link) =>
        new URL(await link.getAttribute('src'), next.url).toString()
      )
    )
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
      const url = new URL(src, next.url)
      return url.href.slice(url.origin.length)
    }
  }

  function getRatio(width, height) {
    return height / width
  }

  it('should load the images', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).toBeGreaterThan(0)
    })

    expect(await getImageUrls(browser)).toContain(
      `${next.url}/_next/image?url=%2Ftest.jpg&w=828&q=75${dpl}`
    )
  })

  it('should preload priority images', async () => {
    const browser = await next.browser('/priority')

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).toBeGreaterThan(0)
    })

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
        imagesrcset: `/_next/image?url=%2Ftest.jpg&w=640&q=75${dpl} 1x, /_next/image?url=%2Ftest.jpg&w=828&q=75${dpl} 2x`,
      },
      {
        imagesizes: '',
        imagesrcset: `/_next/image?url=%2Ftest.gif&w=640&q=75${dpl} 1x, /_next/image?url=%2Ftest.gif&w=828&q=75${dpl} 2x`,
      },
      {
        imagesizes: '',
        imagesrcset: `/_next/image?url=%2Ftest.png&w=640&q=75${dpl} 1x, /_next/image?url=%2Ftest.png&w=828&q=75${dpl} 2x`,
      },
      {
        imagesizes: '100vw',
        imagesrcset: `/_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`,
      },
      {
        imagesizes: '',
        imagesrcset: `/_next/image?url=%2Ftest.tiff&w=640&q=75${dpl} 1x, /_next/image?url=%2Ftest.tiff&w=828&q=75${dpl} 2x`,
      },
    ])

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
    expect(
      await browser.elementById('belowthefold').getAttribute('loading')
    ).toBe(null)

    const warnings = (await browser.log()).map((log) => log.message).join('\n')
    expect(warnings).not.toMatch(
      /was detected as the Largest Contentful Paint/gm
    )

    expect(
      await browser.elementsByCss(
        'link[rel=preload][as=image][crossorigin=use-credentials][imagesrcset*="test.gif"]'
      )
    ).toHaveLength(1)

    expect(
      await browser.elementsByCss(
        'link[rel=preload][as=image][referrerpolicy="no-referrer"][imagesrcset*="test.png"]'
      )
    ).toHaveLength(1)
  })

  it('should not pass through user-provided srcset (causing a flash)', async () => {
    const html = await next.render('/drop-srcset')
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
    const browser = await next.browser('/update')

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("update-image").src`
      )
      expect(src).toMatch(/test\.jpg/)
    })

    await browser.eval(`document.getElementById("toggle").click()`)

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("update-image").src`
      )
      expect(src).toMatch(/test\.png/)
    })
  })

  it('should callback onLoadingComplete when image is fully loaded', async () => {
    const browser = await next.browser('/on-loading-complete')

    await browser.eval(
      `document.getElementById("footer").scrollIntoView({behavior: "smooth"})`
    )

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img1").currentSrc`
      )
      expect(src).toMatch(/test(.*)jpg/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img2").currentSrc`
      )
      expect(src).toMatch(/test(.*).png/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img3").currentSrc`
      )
      expect(src).toMatch(/test\.svg/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img4").currentSrc`
      )
      expect(src).toMatch(/test(.*)ico/)
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg1").textContent`
      )
      expect(text).toBe('loaded 1 img1 with dimensions 128x128')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg2").textContent`
      )
      expect(text).toBe('loaded 1 img2 with dimensions 400x400')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg3").textContent`
      )
      expect(text).toBe('loaded 1 img3 with dimensions 266x266')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg4").textContent`
      )
      expect(text).toBe('loaded 1 img4 with dimensions 21x21')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg5").textContent`
      )
      expect(text).toBe('loaded 1 img5 with dimensions 3x5')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg6").textContent`
      )
      expect(text).toBe('loaded 1 img6 with dimensions 3x5')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg7").textContent`
      )
      expect(text).toBe('loaded 1 img7 with dimensions 400x400')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg8").textContent`
      )
      expect(text).toBe('loaded 1 img8 with dimensions 640x373')
    })
    await retry(async () => {
      const attr = await browser.eval(
        `document.getElementById("img8").getAttribute("data-nimg")`
      )
      expect(attr).toBe('intrinsic')
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img8").currentSrc`
      )
      expect(src).toMatch(/wide.png/)
    })
    await browser.eval('document.getElementById("toggle").click()')
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg8").textContent`
      )
      expect(text).toBe('loaded 2 img8 with dimensions 400x300')
    })
    await retry(async () => {
      const attr = await browser.eval(
        `document.getElementById("img8").getAttribute("data-nimg")`
      )
      expect(attr).toBe('fixed')
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img8").currentSrc`
      )
      expect(src).toMatch(/test-rect.jpg/)
    })
  })

  it('should callback native onLoad in most cases', async () => {
    const browser = await next.browser('/on-load')

    await browser.eval(
      `document.getElementById("footer").scrollIntoView({behavior: "smooth"})`
    )

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img1").currentSrc`
      )
      expect(src).toMatch(/test(.*)jpg/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img2").currentSrc`
      )
      expect(src).toMatch(/test(.*).png/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img3").currentSrc`
      )
      expect(src).toMatch(/test\.svg/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img4").currentSrc`
      )
      expect(src).toMatch(/test(.*)ico/)
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg1").textContent`
      )
      expect(text).toBe('loaded 1 img1 with native onLoad')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg2").textContent`
      )
      expect(text).toBe('loaded 1 img2 with native onLoad')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg3").textContent`
      )
      expect(text).toBe('loaded 1 img3 with native onLoad')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg4").textContent`
      )
      expect(text).toBe('loaded 1 img4 with native onLoad')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg8").textContent`
      )
      expect(text).toBe('loaded 1 img8 with native onLoad')
    })
    await retry(async () => {
      const attr = await browser.eval(
        `document.getElementById("img8").getAttribute("data-nimg")`
      )
      expect(attr).toBe('intrinsic')
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img8").currentSrc`
      )
      expect(src).toMatch(/wide.png/)
    })
    await browser.eval('document.getElementById("toggle").click()')
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg8").textContent`
      )
      expect(text).toBe('loaded 3 img8 with native onLoad')
    })
    await retry(async () => {
      const attr = await browser.eval(
        `document.getElementById("img8").getAttribute("data-nimg")`
      )
      expect(attr).toBe('fixed')
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img8").currentSrc`
      )
      expect(src).toMatch(/test-rect.jpg/)
    })
  })

  it('should callback native onError when error occurred while loading image', async () => {
    const browser = await next.browser('/on-error')

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img1").currentSrc`
      )
      expect(src).toMatch(/test\.png/)
    })
    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("img2").currentSrc`
      )
      expect(src).toMatch(/nonexistent-img\.png/)
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg1").textContent`
      )
      expect(text).toBe('no error occurred')
    })
    await retry(async () => {
      const text = await browser.eval(
        `document.getElementById("msg2").textContent`
      )
      expect(text).toBe('error occurred while loading img2')
    })
  })

  it('should work with image with blob src', async () => {
    const browser = await next.browser('/blob')

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("blob-image").src`
      )
      expect(src).toMatch(/^blob:/)
    })
    await retry(async () => {
      const srcset = await browser.eval(
        `document.getElementById("blob-image").srcset`
      )
      expect(srcset).toBe('')
    })
  })

  it('should work when using flexbox', async () => {
    const browser = await next.browser('/flex')
    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').width`
      )
      expect(result).toBeGreaterThan(0)
    })
  })

  it('should work with layout-fixed so resizing window does not resize image', async () => {
    const browser = await next.browser('/layout-fixed')
    const width = 1200
    const height = 700
    const delta = 250
    const id = 'fixed1'

    await retry(async () => {
      expect(await getSrc(browser, id)).toBe(
        `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
      )
    })
    expect(await browser.elementById(id).getAttribute('srcset')).toBe(
      `/_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1x, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 2x`
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
  })

  it('should work with layout-intrinsic so resizing window maintains image aspect ratio', async () => {
    const browser = await next.browser('/layout-intrinsic')
    const width = 1200
    const height = 700
    const delta = 250
    const id = 'intrinsic1'

    await retry(async () => {
      expect(await getSrc(browser, id)).toBe(
        `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
      )
    })
    expect(await browser.elementById(id).getAttribute('srcset')).toBe(
      `/_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1x, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 2x`
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
  })

  it('should work with layout-responsive so resizing window maintains image aspect ratio', async () => {
    const browser = await next.browser('/layout-responsive')
    const width = 1200
    const height = 700
    const delta = 250
    const id = 'responsive1'

    await retry(async () => {
      expect(await getSrc(browser, id)).toBe(
        `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
      )
    })
    expect(await browser.elementById(id).getAttribute('srcset')).toBe(
      `/_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`
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
  })

  it('should work with layout-fill to fill the parent but NOT stretch with viewport', async () => {
    const browser = await next.browser('/layout-fill')
    const width = 600
    const height = 350
    const delta = 150
    const id = 'fill1'

    await retry(async () => {
      expect(await getSrc(browser, id)).toBe(
        `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
      )
    })
    expect(await browser.elementById(id).getAttribute('srcset')).toBe(
      `/_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`
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
  })

  it('should work with layout-fill to fill the parent and stretch with viewport', async () => {
    const browser = await next.browser('/layout-fill')
    const id = 'fill2'
    const width = await getComputed(browser, id, 'width')
    const height = await getComputed(browser, id, 'height')
    await browser.eval(`document.getElementById("${id}").scrollIntoView()`)

    await retry(async () => {
      expect(await getSrc(browser, id)).toBe(
        `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
      )
    })

    await retry(async () => {
      const srcset = await browser.eval(
        `document.querySelector('#${id}').getAttribute('srcset')`
      )
      expect(srcset).toBe(
        `/_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`
      )
    })

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
    await retry(async () => {
      const srcset = await browser.eval(
        `document.querySelector('#fill3').getAttribute('srcset')`
      )
      expect(srcset).toBe(
        `/_next/image?url=%2Fwide.png&w=256&q=75${dpl} 256w, /_next/image?url=%2Fwide.png&w=384&q=75${dpl} 384w, /_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`
      )
    })

    await browser.eval(`document.getElementById("fill4").scrollIntoView()`)
    await retry(async () => {
      const srcset = await browser.eval(
        `document.querySelector('#fill4').getAttribute('srcset')`
      )
      expect(srcset).toBe(
        `/_next/image?url=%2Fwide.png&w=32&q=75${dpl} 32w, /_next/image?url=%2Fwide.png&w=48&q=75${dpl} 48w, /_next/image?url=%2Fwide.png&w=64&q=75${dpl} 64w, /_next/image?url=%2Fwide.png&w=96&q=75${dpl} 96w, /_next/image?url=%2Fwide.png&w=128&q=75${dpl} 128w, /_next/image?url=%2Fwide.png&w=256&q=75${dpl} 256w, /_next/image?url=%2Fwide.png&w=384&q=75${dpl} 384w, /_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`
      )
    })
  })

  it('should work with sizes and automatically use layout-responsive', async () => {
    const browser = await next.browser('/sizes')
    const width = 1200
    const height = 700
    const delta = 250
    const id = 'sizes1'

    await retry(async () => {
      expect(await getSrc(browser, id)).toBe(
        `/_next/image?url=%2Fwide.png&w=3840&q=75${dpl}`
      )
    })
    expect(await browser.elementById(id).getAttribute('srcset')).toBe(
      `/_next/image?url=%2Fwide.png&w=32&q=75${dpl} 32w, /_next/image?url=%2Fwide.png&w=48&q=75${dpl} 48w, /_next/image?url=%2Fwide.png&w=64&q=75${dpl} 64w, /_next/image?url=%2Fwide.png&w=96&q=75${dpl} 96w, /_next/image?url=%2Fwide.png&w=128&q=75${dpl} 128w, /_next/image?url=%2Fwide.png&w=256&q=75${dpl} 256w, /_next/image?url=%2Fwide.png&w=384&q=75${dpl} 384w, /_next/image?url=%2Fwide.png&w=640&q=75${dpl} 640w, /_next/image?url=%2Fwide.png&w=750&q=75${dpl} 750w, /_next/image?url=%2Fwide.png&w=828&q=75${dpl} 828w, /_next/image?url=%2Fwide.png&w=1080&q=75${dpl} 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75${dpl} 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75${dpl} 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75${dpl} 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75${dpl} 3840w`
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
  })

  it('should handle the styles prop appropriately', async () => {
    const browser = await next.browser('/style-prop')

    expect(await browser.elementById('with-styles').getAttribute('style')).toBe(
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

    if (isNextDev) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
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
  })

  if (isNextDev) {
    it('should show missing src error', async () => {
      const browser = await next.browser('/missing-src')

      await waitForNoRedbox(browser)

      await retry(async () => {
        const logs = (await browser.log()).map((log) => log.message).join('\n')
        expect(logs).toMatch(/Image is missing required "src" property/gm)
      })
    })

    it('should show invalid src error', async () => {
      const browser = await next.browser('/invalid-src')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Invalid src prop (https://google.com/test.png) on `next/image`, hostname "google.com" is not configured under images in your `next.config.js`'
      )
    })

    it('should show invalid src error when protocol-relative', async () => {
      const browser = await next.browser('/invalid-src-proto-relative')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Failed to parse src "//assets.example.com/img.jpg" on `next/image`, protocol-relative URL (//) must be changed to an absolute URL (http:// or https://)'
      )
    })

    it('should show error when string src and placeholder=blur and blurDataURL is missing', async () => {
      const browser = await next.browser('/invalid-placeholder-blur')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.png" has "placeholder='blur'" property but is missing the "blurDataURL" property.`
      )
    })

    it('should show error when not numeric string width or height', async () => {
      const browser = await next.browser('/invalid-width-or-height')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" or "height" property. These should be numeric values.`
      )
    })

    it('should show error when static import and placeholder=blur and blurDataUrl is missing', async () => {
      const browser = await next.browser('/invalid-placeholder-blur-static')

      await waitForRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(
        /Image with src "(.*)bmp" has "placeholder='blur'" property but is missing the "blurDataURL" property/
      )
    })

    it('should warn when img with layout=responsive is inside flex container', async () => {
      const browser = await next.browser('/layout-responsive-inside-flex')
      await browser.eval(`document.getElementById("img").scrollIntoView()`)
      await retry(async () => {
        const logs = (await browser.log()).map((log) => log.message).join('\n')
        expect(logs).toMatch(
          /Image with src (.*)jpg(.*) may not render properly as a child of a flex container. Consider wrapping the image with a div to configure the width/gm
        )
      })
      await waitForNoRedbox(browser)
    })

    it('should warn when img with layout=fill is inside a container without position relative', async () => {
      const browser = await next.browser('/layout-fill-inside-nonrelative')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
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
      await waitForNoRedbox(browser)
    })

    it('should warn when using a very small image with placeholder=blur', async () => {
      const browser = await next.browser('/small-img-import')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) is smaller than 40x40. Consider removing(.*)/gm
      )
    })

    it('should warn when quality is 50', async () => {
      const browser = await next.browser('/quality-50')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) is using quality "50" which is not configured in images.qualities \[75\]. Please update your config to \[50, 75\]./gm
      )
    })

    it('should not warn when Image is child of p', async () => {
      const browser = await next.browser('/inside-paragraph')

      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
      expect(warnings).not.toMatch(
        /Expected server HTML to contain a matching/gm
      )
      expect(warnings).not.toMatch(/cannot appear as a descendant/gm)
    })

    it('should warn when priority prop is missing on LCP image', async () => {
      const browser = await next.browser('/priority-missing-warning')
      await retry(async () => {
        const result = await browser.eval(
          `document.getElementById('responsive').naturalWidth`
        )
        expect(result).toBeGreaterThan(0)
      })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
      expect(warnings).toMatch(
        /Image with src (.*)test(.*) was detected as the Largest Contentful Paint/gm
      )
    })

    it('should warn when loader is missing width', async () => {
      const browser = await next.browser('/invalid-loader')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
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
      const browser = await next.browser('/invalid-sizes')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
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
      const browser = await next.browser('/loader-svg')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      await waitForNoRedbox(browser)
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
      const browser = await next.browser('/warning-once')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      await browser.eval(`document.querySelector("button").click()`)
      await browser.eval(`document.querySelector("button").click()`)
      const count = await browser.eval(
        `document.querySelector("button").textContent`
      )
      expect(count).toBe('Count: 2')
      await retry(async () => {
        const result = await browser.eval(
          'document.getElementById("w").naturalWidth'
        )
        expect(result).toBeGreaterThan(0)
      })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const warnings = (await browser.log())
        .map((log) => log.message)
        .filter((log) => log.startsWith('Image with src'))

      expect(warnings[0]).toMatch(
        'Image with src "/test.png" is using next/legacy/image which is deprecated and will be removed in a future version of Next.js.'
      )
      expect(warnings[1]).toMatch(
        'Image with src "/test.png" has "sizes" property but it will be ignored.'
      )
      expect(warnings[2]).toMatch(
        'Image with src "/test.png" was detected as the Largest Contentful Paint (LCP).'
      )
      expect(warnings.length).toBe(3)
    })
  } else {
    it('should not create an image folder in server/chunks', async () => {
      expect(await next.hasFile('.next/server/chunks/static/media')).toBeFalsy()
    })
  }

  it('should correctly ignore prose styles', async () => {
    const browser = await next.browser('/prose')

    const id = 'prose-image'

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById(${JSON.stringify(id)}).naturalWidth`
      )
      expect(result).toBeGreaterThan(0)
    })

    await new Promise((resolve) => setTimeout(resolve, 1000))

    const computedWidth = await getComputed(browser, id, 'width')
    const computedHeight = await getComputed(browser, id, 'height')
    expect(getRatio(computedWidth, computedHeight)).toBeCloseTo(1, 1)
  })

  it('should apply style inheritance for img elements but not wrapper elements', async () => {
    const browser = await next.browser('/style-inheritance')

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
  })

  it('should apply filter style after image loads', async () => {
    const browser = await next.browser('/style-filter')
    await retry(async () => {
      const src = await getSrc(browser, 'img-plain')
      expect(src).toMatch(/^\/_next\/image/)
    })
    await retry(async () => {
      const src = await getSrc(browser, 'img-blur')
      expect(src).toMatch(/^\/_next\/image/)
    })
    await new Promise((resolve) => setTimeout(resolve, 1000))

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
    const browser = await next.browser('/dynamic-static-img')
    const img = await browser.elementById('dynamic-loaded-static-jpg')
    const src = await img.getAttribute('src')
    const res = await next.fetch(src)
    expect(res.status).toBe(200)
  })

  if (!isNextDev) {
    it('should correctly rotate image', async () => {
      const browser = await next.browser('/rotated')

      const id = 'exif-rotation-image'

      await retry(async () => {
        const result = await browser.eval(
          `document.getElementById(${JSON.stringify(id)}).naturalWidth`
        )
        expect(result).toBeGreaterThan(0)
      })

      await new Promise((resolve) => setTimeout(resolve, 1000))

      const computedWidth = await getComputed(browser, id, 'width')
      const computedHeight = await getComputed(browser, id, 'height')
      expect(getRatio(computedWidth, computedHeight)).toBeCloseTo(0.5625, 1)
    })
  }

  it('should have blurry placeholder when enabled', async () => {
    const html = await next.render('/blurry-placeholder')
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
    const html = await next.render('/blurry-placeholder')
    const $html = cheerio.load(html)
    const style = $html('noscript > img')[0].attribs.style

    expect(style).not.toContain(`background-position`)
    expect(style).not.toContain(`background-size`)
    expect(style).not.toContain(
      `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cfilter id='blur' filterUnits='userSpaceOnUse' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20' edgeMode='duplicate' /%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1' /%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23blur)' href='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMDAwMDAwQEBAQFBQUFBQcHBgYHBwsICQgJCAsRCwwLCwwLEQ8SDw4PEg8bFRMTFRsfGhkaHyYiIiYwLTA+PlT/wAALCAAKAAoBAREA/8QAMwABAQEAAAAAAAAAAAAAAAAAAAcJEAABAwUAAwAAAAAAAAAAAAAFAAYRAQMEEyEVMlH/2gAIAQEAAD8Az1bLPaxhiuk0QdeCOLDtHixN2dmd2bsc5FPX7VTREX//2Q==' x='0' y='0' height='100%25' width='100%25'/%3E%3C/svg%3E")`
    )
  })

  it('should remove blurry placeholder after image loads', async () => {
    const browser = await next.browser('/blurry-placeholder')
    await retry(async () => {
      const bg = await getComputedStyle(
        browser,
        'blurry-placeholder',
        'background-image'
      )
      expect(bg).toBe('none')
    })

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

    await retry(async () => {
      const bg = await getComputedStyle(
        browser,
        'blurry-placeholder-with-lazy',
        'background-image'
      )
      expect(bg).toBe('none')
    })
  })

  it('should re-lazyload images after src changes', async () => {
    const browser = await next.browser('/lazy-src-change')
    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).toBeLessThan(400)
    })

    await browser.eval(
      'document.getElementById("spacer").style.display = "none"'
    )

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).toBeGreaterThanOrEqual(400)
    })

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("basic-image").currentSrc`
      )
      expect(src).toMatch(/test\.jpg/)
    })

    await browser.eval(
      'document.getElementById("spacer").style.display = "block"'
    )
    await browser.eval(
      'document.getElementById("button-change-image-src").click()'
    )
    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).toBeLessThan(400)
    })

    await browser.eval(
      'document.getElementById("spacer").style.display = "none"'
    )
    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('basic-image').naturalWidth`
      )
      expect(result).toBeGreaterThanOrEqual(400)
    })

    await retry(async () => {
      const src = await browser.eval(
        `document.getElementById("basic-image").currentSrc`
      )
      expect(src).toMatch(/test\.png/)
    })
  })

  it('should initially load only two of four images using lazyroot', async () => {
    const browser = await next.browser('/lazy-withref')
    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('myImage1').naturalWidth`
      )
      expect(result).toBeLessThan(400)
    })

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('myImage4').naturalWidth`
      )
      expect(result).toBeLessThan(400)
    })

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('myImage2').naturalWidth`
      )
      expect(result).toBeGreaterThanOrEqual(400)
    })

    await retry(async () => {
      const result = await browser.eval(
        `document.getElementById('myImage3').naturalWidth`
      )
      expect(result).toBeGreaterThanOrEqual(400)
    })

    const imageUrls = await getImageUrls(browser)
    expect(imageUrls).not.toContain(
      `${next.url}/_next/image?url=%2Ftest.jpg&w=828&q=75${dpl}`
    )
    expect(imageUrls).toContain(
      `${next.url}/_next/image?url=%2Ftest.png&w=828&q=75${dpl}`
    )
    expect(imageUrls).toContain(`${next.url}/test.svg`)
    expect(imageUrls).not.toContain(
      `${next.url}/_next/image?url=%2Ftest.webp&w=828&q=75${dpl}`
    )
  })

  it('should be valid HTML', async () => {
    const browser = await next.browser('/valid-html-w3c')
    await new Promise((resolve) => setTimeout(resolve, 1000))
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
  })
})
