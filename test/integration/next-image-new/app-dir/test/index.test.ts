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
        const fetchpriority = await link.getAttribute('fetchpriority')
        const imagesrcset = await link.getAttribute('imagesrcset')
        const imagesizes = await link.getAttribute('imagesizes')
        const crossorigin = await link.getAttribute('crossorigin')
        const referrerpolicy = await link.getAttribute('referrerPolicy')
        entries.push({
          fetchpriority,
          imagesrcset,
          imagesizes,
          crossorigin,
          referrerpolicy,
        })
      }

      expect(
        entries.find(
          (item) =>
            item.imagesrcset ===
            '/_next/image?url=%2Ftest.webp&w=640&q=75 1x, /_next/image?url=%2Ftest.webp&w=828&q=75 2x'
        )
      ).toEqual({
        fetchpriority: 'high',
        imagesizes: '',
        imagesrcset:
          '/_next/image?url=%2Ftest.webp&w=640&q=75 1x, /_next/image?url=%2Ftest.webp&w=828&q=75 2x',
        crossorigin: 'use-credentials',
        referrerpolicy: '',
      })

      expect(
        entries.find(
          (item) =>
            item.imagesrcset ===
            '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w'
        )
      ).toEqual({
        fetchpriority: 'high',
        imagesizes: '100vw',
        imagesrcset:
          '/_next/image?url=%2Fwide.png&w=640&q=75 640w, /_next/image?url=%2Fwide.png&w=750&q=75 750w, /_next/image?url=%2Fwide.png&w=828&q=75 828w, /_next/image?url=%2Fwide.png&w=1080&q=75 1080w, /_next/image?url=%2Fwide.png&w=1200&q=75 1200w, /_next/image?url=%2Fwide.png&w=1920&q=75 1920w, /_next/image?url=%2Fwide.png&w=2048&q=75 2048w, /_next/image?url=%2Fwide.png&w=3840&q=75 3840w',
        crossorigin: '',
        referrerpolicy: '',
      })

      expect(
        entries.find(
          (item) =>
            item.imagesrcset ===
            '/_next/image?url=%2Ftest.png&w=640&q=75 1x, /_next/image?url=%2Ftest.png&w=828&q=75 2x'
        )
      ).toEqual({
        fetchpriority: 'high',
        imagesizes: '',
        imagesrcset:
          '/_next/image?url=%2Ftest.png&w=640&q=75 1x, /_next/image?url=%2Ftest.png&w=828&q=75 2x',
        crossorigin: '',
        referrerpolicy: 'no-referrer',
      })

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

      // When priority={true}, we should set fetchpriority="high"
      expect(
        await browser.elementById('basic-image').getAttribute('fetchpriority')
      ).toBe('high')
      expect(
        await browser.elementById('load-eager').getAttribute('fetchpriority')
      ).toBe(null)
      expect(
        await browser.elementById('responsive1').getAttribute('fetchpriority')
      ).toBe('high')
      expect(
        await browser.elementById('responsive2').getAttribute('fetchpriority')
      ).toBe('high')

      // Setting fetchPriority="low" directly should pass-through to <img>
      expect(
        await browser.elementById('pri-low').getAttribute('fetchpriority')
      ).toBe('low')
      expect(await browser.elementById('pri-low').getAttribute('loading')).toBe(
        'lazy'
      )

      const warnings = (await browser.log('browser'))
        .map((log) => log.message)
        .join('\n')
      expect(warnings).not.toMatch(
        /was detected as the Largest Contentful Paint/gm
      )
      expect(warnings).not.toMatch(/React does not recognize the (.+) prop/gm)
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
      '1'
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
      '1'
    )
    await check(
      () => browser.eval(`document.getElementById("img8").currentSrc`),
      /test-rect.jpg/
    )
    await check(
      () => browser.eval(`document.getElementById("msg9").textContent`),
      'loaded 1 img9 with dimensions 400x400'
    )

    if (mode === 'dev') {
      const warnings = (await browser.log('browser'))
        .map((log) => log.message)
        .join('\n')
      expect(warnings).toMatch(
        /Image with src "(.*)" is using deprecated "onLoadingComplete" property/gm
      )
    }
  })

  it('should callback native onLoad with sythetic event', async () => {
    let browser = await webdriver(appPort, '/on-load')

    await browser.eval(
      `document.getElementById("footer").scrollIntoView({behavior: "smooth"})`
    )

    await check(
      () => browser.eval(`document.getElementById("msg1").textContent`),
      'loaded img1 with native onLoad, count 1'
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'loaded img2 with native onLoad, count 1'
    )
    await check(
      () => browser.eval(`document.getElementById("msg3").textContent`),
      'loaded img3 with native onLoad, count 1'
    )
    await check(
      () => browser.eval(`document.getElementById("msg4").textContent`),
      'loaded img4 with native onLoad, count 1'
    )
    await check(
      () => browser.eval(`document.getElementById("msg5").textContent`),
      'loaded img5 with native onLoad, count 1'
    )
    await check(
      () => browser.eval(`document.getElementById("msg6").textContent`),
      'loaded img6 with native onLoad, count 1'
    )
    await check(
      () =>
        browser.eval(
          `document.getElementById("img5").getAttribute("data-nimg")`
        ),
      '1'
    )

    await browser.eval('document.getElementById("toggle").click()')

    await check(
      () => browser.eval(`document.getElementById("msg1").textContent`),
      'loaded img1 with native onLoad, count 2'
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'loaded img2 with native onLoad, count 2'
    )
    await check(
      () => browser.eval(`document.getElementById("msg3").textContent`),
      'loaded img3 with native onLoad, count 2'
    )
    await check(
      () => browser.eval(`document.getElementById("msg4").textContent`),
      'loaded img4 with native onLoad, count 2'
    )
    await check(
      () => browser.eval(`document.getElementById("msg5").textContent`),
      'loaded img5 with native onLoad, count 1'
    )
    await check(
      () => browser.eval(`document.getElementById("msg6").textContent`),
      'loaded img6 with native onLoad, count 1'
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
    await check(
      () => browser.eval(`document.getElementById("img6").currentSrc`),
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO8ysv7HwAEngHwC+JqOgAAAABJRU5ErkJggg=='
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
    await check(
      () => browser.eval(`document.getElementById("img1").style.color`),
      'transparent'
    )
    await browser.eval(
      `document.getElementById("img2").scrollIntoView({behavior: "smooth"})`
    )
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'no error occured for img2'
    )
    await check(
      () => browser.eval(`document.getElementById("img2").style.color`),
      'transparent'
    )
    await browser.eval(`document.getElementById("toggle").click()`)
    await check(
      () => browser.eval(`document.getElementById("msg2").textContent`),
      'error occured while loading img2'
    )
    await check(
      () => browser.eval(`document.getElementById("img2").style.color`),
      ''
    )
  })

  it('should callback native onError even when error before hydration', async () => {
    let browser = await webdriver(appPort, '/on-error-before-hydration')
    await check(
      () => browser.eval(`document.getElementById("msg").textContent`),
      'error state'
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

      expect(await browser.elementById('img1').getAttribute('style')).toBe(
        'color:transparent'
      )
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
        'color:transparent;padding-left:4rem;width:100%;object-position:30% 30%'
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

      expect(await browser.elementById('img3').getAttribute('style')).toBe(
        'color:transparent'
      )
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
    expect(await browser.elementById('blur1').getAttribute('src')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=828&q=75/
    )
    expect(await browser.elementById('blur1').getAttribute('srcset')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=640&q=75 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=828&q=75 2x/
    )
    expect(await browser.elementById('blur1').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur1').getAttribute('sizes')).toBeNull()
    expect(await browser.elementById('blur1').getAttribute('style')).toMatch(
      'color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;'
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
    expect(await browser.elementById('blur1').getAttribute('src')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=828&q=75/
    )
    expect(await browser.elementById('blur1').getAttribute('srcset')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=640&q=75 1x, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.jpg&w=828&q=75 2x/
    )
    expect(await browser.elementById('blur1').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur1').getAttribute('sizes')).toBeNull()
    expect(await browser.elementById('blur1').getAttribute('style')).toBe(
      'color: transparent;'
    )
    expect(await browser.elementById('blur1').getAttribute('height')).toBe(
      '400'
    )
    expect(await browser.elementById('blur1').getAttribute('width')).toBe('400')

    // blur2
    expect(await browser.elementById('blur2').getAttribute('src')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=3840&q=75/
    )
    expect(await browser.elementById('blur2').getAttribute('srcset')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=384&q=75 384w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=640&q=75 640w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=750&q=75 750w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=828&q=75 828w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=1080&q=75 1080w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=1200&q=75 1200w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=1920&q=75 1920w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=2048&q=75 2048w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=3840&q=75 3840w/
    )
    expect(await browser.elementById('blur2').getAttribute('sizes')).toBe(
      '50vw'
    )
    expect(await browser.elementById('blur2').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur2').getAttribute('style')).toMatch(
      'color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat'
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
    expect(await browser.elementById('blur2').getAttribute('src')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=3840&q=75/
    )
    expect(await browser.elementById('blur2').getAttribute('srcset')).toMatch(
      /\/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=384&q=75 384w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=640&q=75 640w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=750&q=75 750w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=828&q=75 828w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=1080&q=75 1080w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=1200&q=75 1200w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=1920&q=75 1920w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=2048&q=75 2048w, \/_next\/image\?url=%2F_next%2Fstatic%2Fmedia%2Ftest\.(.*)\.png&w=3840&q=75 3840w/
    )
    expect(await browser.elementById('blur2').getAttribute('sizes')).toBe(
      '50vw'
    )
    expect(await browser.elementById('blur2').getAttribute('loading')).toBe(
      'lazy'
    )
    expect(await browser.elementById('blur2').getAttribute('style')).toBe(
      'color: transparent;'
    )
    expect(await browser.elementById('blur2').getAttribute('height')).toBe(
      '400'
    )
    expect(await browser.elementById('blur2').getAttribute('width')).toBe('400')
  })

  it('should handle the styles prop appropriately', async () => {
    const browser = await webdriver(appPort, '/style-prop')

    expect(await browser.elementById('with-styles').getAttribute('style')).toBe(
      'color:transparent;border-radius:10px;padding:10px'
    )
    expect(
      await browser.elementById('with-overlapping-styles').getAttribute('style')
    ).toBe('color:transparent;width:10px;border-radius:10px;margin:15px')
    expect(
      await browser.elementById('without-styles').getAttribute('style')
    ).toBe('color:transparent')
  })

  it('should warn when legacy prop layout=fill', async () => {
    let browser = await webdriver(appPort, '/legacy-layout-fill')
    const img = await browser.elementById('img')
    expect(img).toBeDefined()
    expect(await img.getAttribute('data-nimg')).toBe('fill')
    expect(await img.getAttribute('sizes')).toBe('200px')
    expect(await img.getAttribute('src')).toBe(
      '/_next/image?url=%2Ftest.jpg&w=3840&q=50'
    )
    expect(await img.getAttribute('srcset')).toContain(
      '/_next/image?url=%2Ftest.jpg&w=640&q=50 640w,'
    )
    expect(await img.getAttribute('style')).toBe(
      'position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:cover;object-position:10% 10%;color:transparent'
    )
    if (mode === 'dev') {
      expect(await hasRedbox(browser)).toBe(false)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(warnings).toContain(
        'Image with src "/test.jpg" has legacy prop "layout". Did you forget to run the codemod?'
      )
      expect(warnings).toContain(
        'Image with src "/test.jpg" has legacy prop "objectFit". Did you forget to run the codemod?'
      )
      expect(warnings).toContain(
        'Image with src "/test.jpg" has legacy prop "objectPosition". Did you forget to run the codemod?'
      )
    }
  })

  it('should warn when legacy prop layout=responsive', async () => {
    let browser = await webdriver(appPort, '/legacy-layout-responsive')
    const img = await browser.elementById('img')
    expect(img).toBeDefined()
    expect(await img.getAttribute('sizes')).toBe('100vw')
    expect(await img.getAttribute('data-nimg')).toBe('1')
    expect(await img.getAttribute('src')).toBe(
      '/_next/image?url=%2Ftest.png&w=3840&q=75'
    )
    expect(await img.getAttribute('srcset')).toContain(
      '/_next/image?url=%2Ftest.png&w=640&q=75 640w,'
    )
    expect(await img.getAttribute('style')).toBe(
      'color:transparent;width:100%;height:auto'
    )
    if (mode === 'dev') {
      expect(await hasRedbox(browser)).toBe(false)
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(warnings).toContain(
        'Image with src "/test.png" has legacy prop "layout". Did you forget to run the codemod?'
      )
    }
  })

  it('should render picture via getImageProps', async () => {
    const browser = await webdriver(appPort, '/picture')
    // Wait for image to load:
    await check(async () => {
      const naturalWidth = await browser.eval(
        `document.querySelector('img').naturalWidth`
      )

      if (naturalWidth === 0) {
        throw new Error('Image did not load')
      }

      return 'ready'
    }, 'ready')
    const img = await browser.elementByCss('img')
    expect(img).toBeDefined()
    expect(await img.getAttribute('alt')).toBe('Hero')
    expect(await img.getAttribute('width')).toBe('400')
    expect(await img.getAttribute('height')).toBe('400')
    expect(await img.getAttribute('fetchPriority')).toBe('high')
    expect(await img.getAttribute('sizes')).toBeNull()
    expect(await img.getAttribute('src')).toBe(
      '/_next/image?url=%2Ftest_light.png&w=828&q=75'
    )
    expect(await img.getAttribute('srcset')).toBe(null)
    expect(await img.getAttribute('style')).toBe('color:transparent')
    const source1 = await browser.elementByCss('source:first-of-type')
    expect(await source1.getAttribute('srcset')).toBe(
      '/_next/image?url=%2Ftest.png&w=640&q=75 1x, /_next/image?url=%2Ftest.png&w=828&q=75 2x'
    )
    const source2 = await browser.elementByCss('source:last-of-type')
    expect(await source2.getAttribute('srcset')).toBe(
      '/_next/image?url=%2Ftest_light.png&w=640&q=75 1x, /_next/image?url=%2Ftest_light.png&w=828&q=75 2x'
    )
  })

  if (mode === 'dev') {
    it('should show missing src error', async () => {
      const browser = await webdriver(appPort, '/missing-src')

      expect(await hasRedbox(browser)).toBe(false)

      await check(async () => {
        return (await browser.log()).map((log) => log.message).join('\n')
      }, /Image is missing required "src" property/gm)
    })

    it('should show empty string src error', async () => {
      const browser = await webdriver(appPort, '/empty-string-src')

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

    it('should show error when invalid width prop', async () => {
      const browser = await webdriver(appPort, '/invalid-width')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" property. Expected a numeric value in pixels but received "100%".`
      )
    })

    it('should show error when invalid Infinity width prop', async () => {
      const browser = await webdriver(appPort, '/invalid-Infinity-width')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "width" property. Expected a numeric value in pixels but received "Infinity".`
      )
    })

    it('should show error when invalid height prop', async () => {
      const browser = await webdriver(appPort, '/invalid-height')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/test.jpg" has invalid "height" property. Expected a numeric value in pixels but received "50vh".`
      )
    })

    it('should show missing alt error', async () => {
      const browser = await webdriver(appPort, '/missing-alt')

      expect(await hasRedbox(browser)).toBe(false)

      await check(async () => {
        return (await browser.log()).map((log) => log.message).join('\n')
      }, /Image is missing required "alt" property/gm)
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

    it('should show error when width prop on fill image', async () => {
      const browser = await webdriver(appPort, '/invalid-fill-width')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/wide.png" has both "width" and "fill" properties.`
      )
    })

    it('should show error when CSS position changed on fill image', async () => {
      const browser = await webdriver(appPort, '/invalid-fill-position')

      expect(await hasRedbox(browser)).toBe(true)
      expect(await getRedboxHeader(browser)).toContain(
        `Image with src "/wide.png" has both "fill" and "style.position" properties. Images with "fill" always use position absolute - it cannot be modified.`
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
        const warnings = (await browser.log('browser'))
          .map((log) => log.message)
          .join('\n')
        expect(await hasRedbox(browser)).toBe(false)
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

    it('should not warn when data url image with fill and sizes props', async () => {
      const browser = await webdriver(appPort, '/data-url-with-fill-and-sizes')
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      expect(await hasRedbox(browser)).toBe(false)
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
  } else {
    //server-only tests
    it('should not create an image folder in server/chunks', async () => {
      expect(
        existsSync(join(appDir, '.next/server/chunks/static/media'))
      ).toBeFalsy()
    })
    it('should render as unoptimized with missing src prop', async () => {
      const browser = await webdriver(appPort, '/missing-src')

      const warnings = (await browser.log()).filter(
        (log) => log.source === 'error'
      )
      expect(warnings.length).toBe(0)

      expect(await browser.elementById('img').getAttribute('src')).toBe('')
      expect(await browser.elementById('img').getAttribute('srcset')).toBe(null)
      expect(await browser.elementById('img').getAttribute('width')).toBe('200')
      expect(await browser.elementById('img').getAttribute('height')).toBe(
        '300'
      )
    })
    it('should render as unoptimized with empty string src prop', async () => {
      const browser = await webdriver(appPort, '/empty-string-src')

      const warnings = (await browser.log()).filter(
        (log) => log.source === 'error'
      )
      expect(warnings.length).toBe(0)

      expect(await browser.elementById('img').getAttribute('src')).toBe('')
      expect(await browser.elementById('img').getAttribute('srcset')).toBe(null)
      expect(await browser.elementById('img').getAttribute('width')).toBe('200')
      expect(await browser.elementById('img').getAttribute('height')).toBe(
        '300'
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

  describe('Fill-mode tests', () => {
    let browser
    beforeAll(async () => {
      browser = await webdriver(appPort, '/fill')
    })
    it('should include a data-attribute on fill images', async () => {
      expect(
        await browser.elementById('fill-image-1').getAttribute('data-nimg')
      ).toBe('fill')
    })
    it('should add position:absolute to fill images', async () => {
      expect(await getComputedStyle(browser, 'fill-image-1', 'position')).toBe(
        'absolute'
      )
    })
    it('should add 100% width and height to fill images', async () => {
      expect(
        await browser.eval(
          `document.getElementById("fill-image-1").style.height`
        )
      ).toBe('100%')
      expect(
        await browser.eval(
          `document.getElementById("fill-image-1").style.width`
        )
      ).toBe('100%')
    })
    it('should add position styles to fill images', async () => {
      expect(
        await browser.eval(
          `document.getElementById("fill-image-1").getAttribute('style')`
        )
      ).toBe(
        'position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;color:transparent'
      )
    })
    if (mode === 'dev') {
      it('should not log incorrect warnings', async () => {
        await waitFor(1000)
        const warnings = (await browser.log('browser'))
          .map((log) => log.message)
          .join('\n')
        expect(warnings).not.toMatch(/Image with src (.*) has "fill"/gm)
        expect(warnings).not.toMatch(
          /Image with src (.*) is smaller than 40x40. Consider removing(.*)/gm
        )
      })
      it('should log warnings when using fill mode incorrectly', async () => {
        browser = await webdriver(appPort, '/fill-warnings')
        await waitFor(1000)
        const warnings = (await browser.log('browser'))
          .map((log) => log.message)
          .join('\n')
        expect(warnings).toContain(
          'Image with src "/wide.png" has "fill" and parent element with invalid "position". Provided "static" should be one of absolute,fixed,relative.'
        )
        expect(warnings).toContain(
          'Image with src "/wide.png" has "fill" and a height value of 0. This is likely because the parent element of the image has not been styled to have a set height.'
        )
        expect(warnings).toContain(
          'Image with src "/wide.png" has "fill" but is missing "sizes" prop. Please add it to improve page performance. Read more:'
        )
        expect(warnings).toContain(
          'Image with src "/test.png" has "fill" prop and "sizes" prop of "100vw", but image is not rendered at full viewport width. Please adjust "sizes" to improve page performance. Read more:'
        )
      })
      it('should not log warnings when image unmounts', async () => {
        browser = await webdriver(appPort, '/should-not-warn-unmount')
        await waitFor(1000)
        const warnings = (await browser.log('browser'))
          .map((log) => log.message)
          .join('\n')
        expect(warnings).not.toContain(
          'Image with src "/test.jpg" has "fill" and parent element'
        )
      })
    }
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

  it('should have data url placeholder when enabled', async () => {
    const html = await renderViaHTTP(appPort, '/data-url-placeholder')
    const $html = cheerio.load(html)

    $html('noscript > img').attr('id', 'unused')

    expect($html('#data-url-placeholder-raw')[0].attribs.style).toContain(
      `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
    )

    expect($html('#data-url-placeholder-with-lazy')[0].attribs.style).toContain(
      `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
    )
  })

  it('should remove data url placeholder after image loads', async () => {
    const browser = await webdriver(appPort, '/data-url-placeholder')
    await check(
      async () =>
        await getComputedStyle(
          browser,
          'data-url-placeholder-raw',
          'background-image'
        ),
      'none'
    )
    expect(
      await getComputedStyle(
        browser,
        'data-url-placeholder-with-lazy',
        'background-image'
      )
    ).toBe(
      `url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
    )

    await browser.eval('document.getElementById("spacer").remove()')

    await check(
      async () =>
        await getComputedStyle(
          browser,
          'data-url-placeholder-with-lazy',
          'background-image'
        ),
      'none'
    )
  })

  it('should render correct objectFit when data url placeholder and fill', async () => {
    const html = await renderViaHTTP(appPort, '/fill-data-url-placeholder')
    const $ = cheerio.load(html)

    expect($('#data-url-placeholder-fit-cover')[0].attribs.style).toBe(
      `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:cover;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
    )

    expect($('#data-url-placeholder-fit-contain')[0].attribs.style).toBe(
      `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:contain;color:transparent;background-size:contain;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
    )

    expect($('#data-url-placeholder-fit-fill')[0].attribs.style).toBe(
      `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:fill;color:transparent;background-size:fill;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;base64,Cjxzdmcgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIHZlcnNpb249IjEuMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4bWxuczp4bGluaz0iaHR0cDovL3d3dy53My5vcmcvMTk5OS94bGluayI+CiAgPGRlZnM+CiAgICA8bGluZWFyR3JhZGllbnQgaWQ9ImciPgogICAgICA8c3RvcCBzdG9wLWNvbG9yPSIjMzMzIiBvZmZzZXQ9IjIwJSIgLz4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzIyMiIgb2Zmc2V0PSI1MCUiIC8+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiMzMzMiIG9mZnNldD0iNzAlIiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiIC8+CiAgPHJlY3QgaWQ9InIiIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIiBmaWxsPSJ1cmwoI2cpIiAvPgogIDxhbmltYXRlIHhsaW5rOmhyZWY9IiNyIiBhdHRyaWJ1dGVOYW1lPSJ4IiBmcm9tPSItMjAwIiB0bz0iMjAwIiBkdXI9IjFzIiByZXBlYXRDb3VudD0iaW5kZWZpbml0ZSIgIC8+Cjwvc3ZnPg==")`
    )
  })

  it('should have blurry placeholder when enabled', async () => {
    const html = await renderViaHTTP(appPort, '/blurry-placeholder')
    const $html = cheerio.load(html)

    $html('noscript > img').attr('id', 'unused')

    expect($html('#blurry-placeholder-raw')[0].attribs.style).toContain(
      `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8P4nhDwAGuAKPn6cicwAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
    )

    expect($html('#blurry-placeholder-with-lazy')[0].attribs.style).toContain(
      `color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO0/8/wBwAE/wI85bEJ6gAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
    )
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
      `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mO0/8/wBwAE/wI85bEJ6gAAAABJRU5ErkJggg=='/%3E%3C/svg%3E")`
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

  it('should render correct objectFit when blurDataURL and fill', async () => {
    const html = await renderViaHTTP(appPort, '/fill-blur')
    const $ = cheerio.load(html)

    expect($('#fit-cover')[0].attribs.style).toBe(
      `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:cover;color:transparent;background-size:cover;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' %3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='xMidYMid slice' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAAAAABd+vKJAAAANklEQVR42mNg4GRwdWBgZ2BgUGI4dYhBmYFBgiHy308PBlEGKYbr//9fYJBlYDBYv3nzGkUGANGMDBq2MCnBAAAAAElFTkSuQmCC'/%3E%3C/svg%3E")`
    )

    expect($('#fit-contain')[0].attribs.style).toBe(
      `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:contain;color:transparent;background-size:contain;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' %3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='xMidYMid' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAAAAABd+vKJAAAANklEQVR42mNg4GRwdWBgZ2BgUGI4dYhBmYFBgiHy308PBlEGKYbr//9fYJBlYDBYv3nzGkUGANGMDBq2MCnBAAAAAElFTkSuQmCC'/%3E%3C/svg%3E")`
    )

    expect($('#fit-fill')[0].attribs.style).toBe(
      `position:absolute;height:100%;width:100%;left:0;top:0;right:0;bottom:0;object-fit:fill;color:transparent;background-size:fill;background-position:50% 50%;background-repeat:no-repeat;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' %3E%3Cfilter id='b' color-interpolation-filters='sRGB'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3CfeColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 100 -1' result='s'/%3E%3CfeFlood x='0' y='0' width='100%25' height='100%25'/%3E%3CfeComposite operator='out' in='s'/%3E%3CfeComposite in2='SourceGraphic'/%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Cimage width='100%25' height='100%25' x='0' y='0' preserveAspectRatio='none' style='filter: url(%23b);' href='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAFCAAAAABd+vKJAAAANklEQVR42mNg4GRwdWBgZ2BgUGI4dYhBmYFBgiHy308PBlEGKYbr//9fYJBlYDBYv3nzGkUGANGMDBq2MCnBAAAAAElFTkSuQmCC'/%3E%3C/svg%3E")`
    )
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

describe('Image Component Default Tests', () => {
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
