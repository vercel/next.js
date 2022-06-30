/* eslint-env jest */

import cheerio from 'cheerio'
import validateHTML from 'html-validator'
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
        await browser.elementById('load-eager').getAttribute('loading')
      ).toBe('eager')
      expect(
        await browser.elementById('responsive1').getAttribute('loading')
      ).toBe(null)
      expect(
        await browser.elementById('responsive2').getAttribute('loading')
      ).toBe(null)

      const warnings = (await browser.log('browser'))
        .map((log) => log.message)
        .join('\n')
      expect(warnings).not.toMatch(
        /was detected as the Largest Contentful Paint/gm
      )
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
    expect(els.length).toBe(1)

    const [el] = els

    expect(el.attribs.src).not.toBe('/truck.jpg')
    expect(el.attribs.srcset).not.toBe(
      '/truck375.jpg 375w, /truck640.jpg 640w, /truck.jpg'
    )
    expect(el.attribs.srcSet).not.toBe(
      '/truck375.jpg 375w, /truck640.jpg 640w, /truck.jpg'
    )
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
    let browser = await webdriver(appPort, '/on-loading-complete')

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
      'loaded 1 img3 with dimensions 400x400'
    )
    await check(
      () => browser.eval(`document.getElementById("msg4").textContent`),
      'loaded 1 img4 with dimensions 32x32'
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
      'future'
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
      'future'
    )
    await check(
      () => browser.eval(`document.getElementById("img8").currentSrc`),
      /test-rect.jpg/
    )
    await check(
      () => browser.eval(`document.getElementById("msg9").textContent`),
      'loaded 1 img9 with dimensions 400x400'
    )
  })

  it('should callback native onLoad in most cases', async () => {
    let browser = await webdriver(appPort, '/on-load')

    await browser.eval('document.getElementById("toggle").click()')

    await browser.eval(
      `document.getElementById("footer").scrollIntoView({behavior: "smooth"})`
    )

    await check(
      () => browser.eval(`document.getElementById("msg1").textContent`),
      'loaded img1 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'loaded img2 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg3").textContent`),
      'loaded img3 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg4").textContent`),
      'loaded img4 with native onLoad'
    )
    await check(
      () => browser.eval(`document.getElementById("msg5").textContent`),
      'loaded img5 with native onLoad'
    )
    await check(
      () =>
        browser.eval(
          `document.getElementById("img5").getAttribute("data-nimg")`
        ),
      'future'
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
      () => browser.eval(`document.getElementById("img5").currentSrc`),
      /wide.png/
    )
  })

  it('should callback native onError when error occured while loading image', async () => {
    let browser = await webdriver(appPort, '/on-error')
    await browser.eval(
      `document.getElementById("img1").scrollIntoView({behavior: "smooth"})`
    )
    await check(
      () => browser.eval(`document.getElementById("msg1").textContent`),
      'no error occured for img1'
    )
    await browser.eval(
      `document.getElementById("img2").scrollIntoView({behavior: "smooth"})`
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'no error occured for img2'
    )
    await browser.eval(`document.getElementById("toggle").click()`)
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

  it('should work with sizes and automatically use responsive srcset', async () => {
    const browser = await webdriver(appPort, '/sizes')
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
  })

  it('should render no wrappers or sizers', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/wrapper-div')

      const numberOfChildren = await browser.eval(
        `document.getElementById('image-container1').children.length`
      )
      expect(numberOfChildren).toBe(1)
      const childElementType = await browser.eval(
        `document.getElementById('image-container1').children[0].nodeName`
      )
      expect(childElementType).toBe('IMG')

      expect(await browser.elementById('img1').getAttribute('style')).toBeNull()
      expect(await browser.elementById('img1').getAttribute('height')).toBe(
        '700'
      )
      expect(await browser.elementById('img1').getAttribute('width')).toBe(
        '1200'
      )
      expect(await browser.elementById('img1').getAttribute('srcset')).toBe(
        `/_next/image?url=%2Fwide.png&w=1200&q=75 1x, /_next/image?url=%2Fwide.png&w=3840&q=75 2x`
      )
      expect(await browser.elementById('img1').getAttribute('loading')).toBe(
        'eager'
      )

      expect(await browser.elementById('img2').getAttribute('style')).toBe(
        'padding-left:4rem;width:100%;object-position:30% 30%'
      )
      expect(await browser.elementById('img2').getAttribute('height')).toBe(
        '700'
      )
      expect(await browser.elementById('img2').getAttribute('width')).toBe(
        '1200'
      )
      expect(await browser.elementById('img2').getAttribute('srcset')).toBe(
        `/_next/image?url=%2Fwide.png&w=16&q=75 16w, /_next/image?url=%2Fwide.png&w=32&q=75 32w, /_next/image?url=%2Fwide.png&w=48&q=75 48w, /_next/image?url=%2Fwide.png&w=64&q=75 64w, /_next/image?url=%2Fwide.png&w=96&q=75 96w, /_next/image?url=%2Fwide.png&w=128&q=75 128w, /_next/image?url=%2Fwide.png&w=256&q=75 256w, /_next/image?url=%2Fwide.png&w=384&q=75 384w, /_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w`
      )
      expect(await browser.elementById('img2').getAttribute('loading')).toBe(
        'lazy'
      )

      expect(await browser.elementById('img3').getAttribute('style')).toBeNull()
      expect(await browser.elementById('img3').getAttribute('srcset')).toBe(
        `/_next/image?url=%2Ftest.png&w=640&q=75 1x, /_next/image?url=%2Ftest.png&w=828&q=75 2x`
      )
      if (mode === 'dev') {
        await waitFor(1000)
        const warnings = (await browser.log('browser'))
          .map((log) => log.message)
          .join('\n')
        expect(warnings).toMatch(
          /Image with src "\/wide.png" has either width or height modified, but not the other./gm
        )
        expect(warnings).not.toMatch(
          /Image with src "\/test.png" has either width or height modified, but not the other./gm
        )
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should lazy load with placeholder=blur', async () => {
    const browser = await webdriver(appPort, '/placeholder-blur')

    // blur1
    expect(await browser.elementById('blur1').getAttribute('src')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
    )
    expect(await browser.elementById('blur1').getAttribute('srcset')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=75 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75 2x'
    )
    expect(await browser.elementById('blur1').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur1').getAttribute('sizes')).toBeNull()
    expect(await browser.elementById('blur1').getAttribute('style')).toMatch(
      'background-size:cover;background-position:0% 0%;'
    )
    expect(await browser.elementById('blur1').getAttribute('height')).toBe(
      '400'
    )
    expect(await browser.elementById('blur1').getAttribute('width')).toBe('400')
    await browser.eval(
      `document.getElementById("blur1").scrollIntoView({behavior: "smooth"})`
    )
    await check(
      () => browser.eval(`document.getElementById("blur1").currentSrc`),
      /test(.*)jpg/
    )
    expect(await browser.elementById('blur1').getAttribute('src')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75'
    )
    expect(await browser.elementById('blur1').getAttribute('srcset')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=640&q=75 1x, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.fab2915d.jpg&w=828&q=75 2x'
    )
    expect(await browser.elementById('blur1').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur1').getAttribute('sizes')).toBeNull()
    expect(await browser.elementById('blur1').getAttribute('style')).toMatch('')
    expect(await browser.elementById('blur1').getAttribute('height')).toBe(
      '400'
    )
    expect(await browser.elementById('blur1').getAttribute('width')).toBe('400')

    // blur2
    expect(await browser.elementById('blur2').getAttribute('src')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=3840&q=75'
    )
    expect(await browser.elementById('blur2').getAttribute('srcset')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=384&q=75 384w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=75 640w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=750&q=75 750w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=75 828w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=1080&q=75 1080w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=1200&q=75 1200w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=1920&q=75 1920w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=2048&q=75 2048w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=3840&q=75 3840w'
    )
    expect(await browser.elementById('blur2').getAttribute('sizes')).toBe(
      '50vw'
    )
    expect(await browser.elementById('blur2').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur2').getAttribute('style')).toMatch(
      'background-size:cover;background-position:0% 0%;'
    )
    expect(await browser.elementById('blur2').getAttribute('height')).toBe(
      '400'
    )
    expect(await browser.elementById('blur2').getAttribute('width')).toBe('400')
    await browser.eval(
      `document.getElementById("blur2").scrollIntoView({behavior: "smooth"})`
    )
    await check(
      () => browser.eval(`document.getElementById("blur2").currentSrc`),
      /test(.*)png/
    )
    expect(await browser.elementById('blur2').getAttribute('src')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=3840&q=75'
    )
    expect(await browser.elementById('blur2').getAttribute('srcset')).toBe(
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=384&q=75 384w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=640&q=75 640w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=750&q=75 750w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=75 828w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=1080&q=75 1080w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=1200&q=75 1200w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=1920&q=75 1920w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=2048&q=75 2048w, /_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=3840&q=75 3840w'
    )
    expect(await browser.elementById('blur2').getAttribute('sizes')).toBe(
      '50vw'
    )
    expect(await browser.elementById('blur2').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur2').getAttribute('style')).toBe('')
    expect(await browser.elementById('blur2').getAttribute('height')).toBe(
      '400'
    )
    expect(await browser.elementById('blur2').getAttribute('width')).toBe('400')
  })

  it('should handle the styles prop appropriately', async () => {
    const browser = await webdriver(appPort, '/style-prop')

    expect(await browser.elementById('with-styles').getAttribute('style')).toBe(
      'border-radius:10px;padding:10px'
    )
    expect(
      await browser.elementById('with-overlapping-styles').getAttribute('style')
    ).toBe('width:10px;border-radius:10px;margin:15px')
    expect(
      await browser.elementById('without-styles').getAttribute('style')
    ).toBeNull()
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

    it('should show error when string src and placeholder=blur and blurDataURL is missing', async () => {
      const browser = await webdriver(appPort, '/invalid-placeholder-blur')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.png" has "placeholder='blur'" property but is missing the "blurDataURL" property.`
      )
    })

    it('should show error when invalid width prop', async () => {
      const browser = await webdriver(appPort, '/invalid-width')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" property. Expected a numeric value in pixels but received "100%".`
      )
    })

    it('should show error when invalid height prop', async () => {
      const browser = await webdriver(appPort, '/invalid-height')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "height" property. Expected a numeric value in pixels but received "50vh".`
      )
    })

    it('should show error when missing width prop', async () => {
      const browser = await webdriver(appPort, '/missing-width')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" is missing required "width" property.`
      )
    })

    it('should show error when missing height prop', async () => {
      const browser = await webdriver(appPort, '/missing-height')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" is missing required "height" property.`
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

    it('should warn when using a very small image with placeholder=blur', async () => {
      const browser = await webdriver(appPort, '/small-img-import')

      const warnings = (await browser.log('browser'))
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
      expect(warnings).toMatch(
        /Image with src (.*)jpg(.*) is smaller than 40x40. Consider removing(.*)/gm
      )
    })

    it('should not warn when Image is child of p', async () => {
      const browser = await webdriver(appPort, '/inside-paragraph')

      const warnings = (await browser.log('browser'))
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
        const warnings = (await browser.log('browser'))
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
      const warnings = (await browser.log('browser'))
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

    it('should not warn when svg, even if with loader prop or without', async () => {
      const browser = await webdriver(appPort, '/loader-svg')
      await browser.eval(`document.querySelector("footer").scrollIntoView()`)
      const warnings = (await browser.log('browser'))
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
      const warnings = (await browser.log('browser'))
        .map((log) => log.message)
        .filter((log) => log.startsWith('Image with src'))
      expect(warnings[0]).toMatch(
        'Image with src "/test.png" was detected as the Largest Contentful Paint (LCP).'
      )
      expect(warnings.length).toBe(1)
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

  // Tests that use the `unsized` attribute:
  if (mode !== 'dev') {
    it('should correctly rotate image', async () => {
      const browser = await webdriver(appPort, '/rotated')

      const id = 'exif-rotation-image'

      // Wait for image to load:
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById(${JSON.stringify(id)}).naturalWidth`
        )

        if (result === 0) {
          throw new Error('Image not ready')
        }

        return 'result-correct'
      }, /result-correct/)

      await waitFor(500)

      const computedWidth = await getComputed(browser, id, 'width')
      const computedHeight = await getComputed(browser, id, 'height')
      expect(getRatio(computedHeight, computedWidth)).toBeCloseTo(0.75, 1)
    })
  }

  it('should have blurry placeholder when enabled', async () => {
    const html = await renderViaHTTP(appPort, '/blurry-placeholder')
    const $html = cheerio.load(html)

    $html('noscript > img').attr('id', 'unused')

    expect($html('#blurry-placeholder-raw')[0].attribs.style).toContain(
      `background-size:cover;background-position:0% 0%;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http%3A//www.w3.org/2000/svg' xmlns%3Axlink='http%3A//www.w3.org/1999/xlink' viewBox='0 0 400 400'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='50'%3E%3C/feGaussianBlur%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1'%3E%3C/feFuncA%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23b)' x='0' y='0' height='100%25' width='100%25' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8P4nhDwAGuAKPn6cicwAAAABJRU5ErkJggg=='%3E%3C/image%3E%3C/svg%3E")`
    )

    expect($html('#blurry-placeholder-with-lazy')[0].attribs.style).toContain(
      `background-size:cover;background-position:0% 0%;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http%3A//www.w3.org/2000/svg' xmlns%3Axlink='http%3A//www.w3.org/1999/xlink' viewBox='0 0 400 400'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='50'%3E%3C/feGaussianBlur%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1'%3E%3C/feFuncA%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23b)' x='0' y='0' height='100%25' width='100%25' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO0/8/wBwAE/wI85bEJ6gAAAABJRU5ErkJggg=='%3E%3C/image%3E%3C/svg%3E")`
    )
  })

  it('should not use blurry placeholder for <noscript> image', async () => {
    const html = await renderViaHTTP(appPort, '/blurry-placeholder')
    const $html = cheerio.load(html)
    const img = $html('noscript > img')[0]
    expect(img).toBeDefined()
    expect(img.attribs.id).toBe('blurry-placeholder-raw')
    expect(img.attribs.style).toBeUndefined()
  })

  it('should remove blurry placeholder after image loads', async () => {
    const browser = await webdriver(appPort, '/blurry-placeholder')
    await check(
      async () =>
        await getComputedStyle(
          browser,
          'blurry-placeholder-raw',
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
      `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http%3A//www.w3.org/2000/svg' xmlns%3Axlink='http%3A//www.w3.org/1999/xlink' viewBox='0 0 400 400'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='50'%3E%3C/feGaussianBlur%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1 1'%3E%3C/feFuncA%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Cimage filter='url(%23b)' x='0' y='0' height='100%25' width='100%25' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO0/8/wBwAE/wI85bEJ6gAAAABJRU5ErkJggg=='%3E%3C/image%3E%3C/svg%3E")`
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
  })

  it('should be valid HTML', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/valid-html-w3c')
      await waitFor(1000)
      expect(await browser.hasElementByCssSelector('img')).toBeTruthy()
      const url = await browser.url()
      const result = await validateHTML({
        url,
        format: 'json',
        isLocal: true,
        validator: 'whatwg',
      })
      expect(result.isValid).toBe(true)
      expect(result.errors).toEqual([])
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}

describe('Future Image Component Tests', () => {
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

  describe('server mode', () => {
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
