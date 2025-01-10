/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import {
  assertHasRedbox,
  assertNoRedbox,
  check,
  getRedboxHeader,
} from 'next-test-utils'
import { NextInstance } from 'e2e-utils'

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
    window.checkInterval = setInterval(function() {
      let watcherDiv = document.querySelector('#__next-build-indicator')
      watcherDiv = watcherDiv.shadowRoot || watcherDiv
      window.showedBuilder = window.showedBuilder || (
        watcherDiv.querySelector('div').className.indexOf('visible') > -1
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 50)
  })()`)
}

describe('GS(S)P Server-Side Change Reloading', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../pages')),
        lib: new FileRef(join(__dirname, '../lib')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should not reload page when client-side is changed too GSP', async () => {
    const browser = await webdriver(next.url, '/gsp-blog/first')
    await check(() => browser.elementByCss('#change').text(), 'change me')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())

    const page = 'pages/gsp-blog/[post].js'
    const originalContent = await next.readFile(page)
    await next.patchFile(page, originalContent.replace('change me', 'changed'))

    await check(() => browser.elementByCss('#change').text(), 'changed')
    expect(await browser.eval(`window.beforeChange`)).toBe('hi')

    const props2 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual(props2)

    await next.patchFile(page, originalContent)
    await check(() => browser.elementByCss('#change').text(), 'change me')
  })

  it('should update page when getStaticProps is changed only', async () => {
    const browser = await webdriver(next.url, '/gsp-blog/first')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/gsp-blog/[post].js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('count = 1', 'count = 2')
    )

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '2'
    )
    expect(await browser.eval(`window.beforeChange`)).toBe('hi')
    await next.patchFile(page, originalContent)

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '1'
    )
  })

  it('should show indicator when re-fetching data', async () => {
    const browser = await webdriver(next.url, '/gsp-blog/second')
    await installCheckVisible(browser)
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/gsp-blog/[post].js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('count = 1', 'count = 2')
    )

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '2'
    )
    expect(await browser.eval(`window.beforeChange`)).toBe('hi')
    expect(await browser.eval(`window.showedBuilder`)).toBe(true)

    await next.patchFile(page, originalContent)
    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '1'
    )
  })

  it('should update page when getStaticPaths is changed only', async () => {
    const browser = await webdriver(next.url, '/gsp-blog/first')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/gsp-blog/[post].js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('paths = 1', 'paths = 2')
    )

    expect(await browser.eval('window.beforeChange')).toBe('hi')
    await next.patchFile(page, originalContent)
  })

  it('should update page when getStaticProps is changed only for /index', async () => {
    const browser = await webdriver(next.url, '/')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/index.js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('count = 1', 'count = 2')
    )

    expect(await browser.eval('window.beforeChange')).toBe('hi')
    await next.patchFile(page, originalContent)
  })

  it('should update page when getStaticProps is changed only for /another/index', async () => {
    const browser = await webdriver(next.url, '/another')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/another/index.js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('count = 1', 'count = 2')
    )

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '2'
    )
    expect(await browser.eval('window.beforeChange')).toBe('hi')
    await next.patchFile(page, originalContent)
  })

  it('should keep scroll position when updating from change in getStaticProps', async () => {
    const browser = await webdriver(next.url, '/another')
    await browser.eval(
      'document.getElementById("scroll-target").scrollIntoView()'
    )
    const scrollPosition = await browser.eval(
      'document.documentElement.scrollTop'
    )
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/another/index.js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('count = 1', 'count = 2')
    )

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '2'
    )
    expect(await browser.eval('window.beforeChange')).toBe('hi')
    expect(await browser.eval('document.documentElement.scrollTop')).toBe(
      scrollPosition
    )
    await next.patchFile(page, originalContent)
  })

  it('should not reload page when client-side is changed too GSSP', async () => {
    const browser = await webdriver(next.url, '/gssp-blog/first')
    await check(() => browser.elementByCss('#change').text(), 'change me')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())

    const page = 'pages/gssp-blog/[post].js'
    const originalContent = await next.readFile(page)
    await next.patchFile(page, originalContent.replace('change me', 'changed'))

    await check(() => browser.elementByCss('#change').text(), 'changed')
    expect(await browser.eval(`window.beforeChange`)).toBe('hi')

    const props2 = JSON.parse(await browser.elementByCss('#props').text())
    expect(props).toEqual(props2)

    await next.patchFile(page, originalContent)
    await check(() => browser.elementByCss('#change').text(), 'change me')
  })

  it('should update page when getServerSideProps is changed only', async () => {
    const browser = await webdriver(next.url, '/gssp-blog/first')
    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '1'
    )
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/gssp-blog/[post].js'
    const originalContent = await next.readFile(page)
    await next.patchFile(
      page,
      originalContent.replace('count = 1', 'count = 2')
    )

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '2'
    )
    expect(await browser.eval(`window.beforeChange`)).toBe('hi')
    await next.patchFile(page, originalContent)

    await check(
      async () =>
        JSON.parse(await browser.elementByCss('#props').text()).count + '',
      '1'
    )
  })

  it('should update on props error in getStaticProps', async () => {
    const browser = await webdriver(next.url, '/')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/index.js'
    const originalContent = await next.readFile(page)

    try {
      await next.patchFile(page, originalContent.replace('props:', 'propss:'))
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Additional keys were returned from'
      )

      await next.patchFile(page, originalContent)
      await assertNoRedbox(browser)
    } finally {
      await next.patchFile(page, originalContent)
    }
  })

  it('should update on thrown error in getStaticProps', async () => {
    const browser = await webdriver(next.url, '/')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/index.js'
    const originalContent = await next.readFile(page)

    try {
      await next.patchFile(
        page,
        originalContent.replace(
          'const count',
          'throw new Error("custom oops"); const count'
        )
      )
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain('custom oops')

      await next.patchFile(page, originalContent)
      await assertNoRedbox(browser)
    } finally {
      await next.patchFile(page, originalContent)
    }
  })

  it('should refresh data when server import is updated', async () => {
    const browser = await webdriver(next.url, '/')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)
    expect(props.data).toEqual({ hello: 'world' })

    const page = 'lib/data.json'
    const originalContent = await next.readFile(page)

    try {
      await next.patchFile(page, JSON.stringify({ hello: 'replaced!!' }))
      await check(async () => {
        const props = JSON.parse(await browser.elementByCss('#props').text())
        return props.count === 1 && props.data.hello === 'replaced!!'
          ? 'success'
          : JSON.stringify(props)
      }, 'success')
      expect(await browser.eval('window.beforeChange')).toBe('hi')

      await next.patchFile(page, originalContent)
      await check(async () => {
        const props = JSON.parse(await browser.elementByCss('#props').text())
        return props.count === 1 && props.data.hello === 'world'
          ? 'success'
          : JSON.stringify(props)
      }, 'success')
    } finally {
      await next.patchFile(page, originalContent)
    }
  })
})
