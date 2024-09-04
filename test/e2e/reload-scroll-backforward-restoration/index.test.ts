import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { check } from 'next-test-utils'
import { join } from 'path'
import webdriver from 'next-webdriver'
import assert from 'assert'

describe('reload-scroll-back-restoration', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'pages')),
        'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should restore the scroll position on navigating back', async () => {
    const browser = await webdriver(next.url, '/0')
    await browser.eval(() => document.querySelector('#link').scrollIntoView())

    // check browser restoration setting
    const scrollRestoration = await browser.eval(
      () => window.history.scrollRestoration
    )
    expect(scrollRestoration).toBe('manual')

    const scrollPositionMemories: Array<{ x: number; y: number }> = []
    scrollPositionMemories.push({
      x: Math.floor(await browser.eval(() => window.scrollX)),
      y: Math.floor(await browser.eval(() => window.scrollY)),
    })

    // check initial value
    expect(scrollPositionMemories[0].x).not.toBe(0)
    expect(scrollPositionMemories[0].y).not.toBe(0)

    await browser.eval(`window.next.router.push('/1')`)
    await browser.eval(() => document.querySelector('#link').scrollIntoView())
    scrollPositionMemories.push({
      x: Math.floor(await browser.eval(() => window.scrollX)),
      y: Math.floor(await browser.eval(() => window.scrollY)),
    })
    await browser.eval(`window.next.router.push('/2')`)

    // check restore value on history index: 1
    await browser.back()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /routeChangeComplete/
    )

    await check(async () => {
      assert.equal(
        scrollPositionMemories[1].x,
        Math.floor(await browser.eval(() => window.scrollX))
      )
      assert.equal(
        scrollPositionMemories[1].y,
        Math.floor(await browser.eval(() => window.scrollY))
      )
      return 'success'
    }, 'success')

    await browser.refresh()

    await check(async () => {
      const isReady = await browser.eval('next.router.isReady')
      return isReady ? 'success' : isReady
    }, 'success')

    // check restore value on history index: 0
    await browser.back()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /routeChangeComplete/
    )

    await check(async () => {
      assert.equal(
        scrollPositionMemories[0].x,
        Math.floor(await browser.eval(() => window.scrollX))
      )
      assert.equal(
        scrollPositionMemories[0].y,
        Math.floor(await browser.eval(() => window.scrollY))
      )
      return 'success'
    }, 'success')
  })

  it('should restore the scroll position on navigating forward', async () => {
    const browser = await webdriver(next.url, '/0')
    await browser.eval(() => document.querySelector('#link').scrollIntoView())

    // check browser restoration setting
    const scrollRestoration = await browser.eval(
      () => window.history.scrollRestoration
    )
    expect(scrollRestoration).toBe('manual')

    const scrollPositionMemories: Array<{ x: number; y: number }> = []
    scrollPositionMemories.push({
      x: Math.floor(await browser.eval(() => window.scrollX)),
      y: Math.floor(await browser.eval(() => window.scrollY)),
    })

    // check initial value
    expect(scrollPositionMemories[0].x).not.toBe(0)
    expect(scrollPositionMemories[0].y).not.toBe(0)

    await browser.eval(`window.next.router.push('/1')`)
    await browser.eval(() => document.querySelector('#link').scrollIntoView())
    scrollPositionMemories.push({
      x: Math.floor(await browser.eval(() => window.scrollX)),
      y: Math.floor(await browser.eval(() => window.scrollY)),
    })
    await browser.eval(`window.next.router.push('/2')`)
    await browser.eval(() => document.querySelector('#link').scrollIntoView())
    scrollPositionMemories.push({
      x: Math.floor(await browser.eval(() => window.scrollX)),
      y: Math.floor(await browser.eval(() => window.scrollY)),
    })

    // check restore value on history index: 1
    await browser.back()
    await browser.back()
    await browser.forward()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /routeChangeComplete/
    )

    await check(async () => {
      assert.equal(
        scrollPositionMemories[1].x,
        Math.floor(await browser.eval(() => window.scrollX))
      )
      assert.equal(
        scrollPositionMemories[1].y,
        Math.floor(await browser.eval(() => window.scrollY))
      )
      return 'success'
    }, 'success')

    await browser.refresh()

    await check(async () => {
      const isReady = await browser.eval('next.router.isReady')
      return isReady ? 'success' : isReady
    }, 'success')

    // check restore value on history index: 2
    await browser.forward()
    await check(
      () => browser.eval(() => document.documentElement.innerHTML),
      /routeChangeComplete/
    )

    await check(async () => {
      assert.equal(
        scrollPositionMemories[2].x,
        Math.floor(await browser.eval(() => window.scrollX))
      )
      assert.equal(
        scrollPositionMemories[2].y,
        Math.floor(await browser.eval(() => window.scrollY))
      )
      return 'success'
    }, 'success')
  })
})
