/* eslint-env jest */

import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox, check } from 'next-test-utils'

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
      window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot;
      const statusElement = root.querySelector('[data-indicator-status]')
      const badge = root.querySelector('[data-next-badge]')
      const status = badge ? badge.getAttribute('data-status') : null

      // Check if we're showing any status
      window.showedBuilder = window.showedBuilder || (
        statusElement !== null || (status && status !== 'none')
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 50)
  })()`)
}

describe('GS(S)P Server-Side Change Reloading', () => {
  const { next } = nextTestSetup({
    files: {
      pages: new FileRef(join(__dirname, '../pages')),
      lib: new FileRef(join(__dirname, '../lib')),
    },
  })

  it('should not reload page when client-side is changed too GSP', async () => {
    const browser = await next.browser('/gsp-blog/first')
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
    const browser = await next.browser('/gsp-blog/first')
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

  // Skipped. This test is meant to verify the dev indicator stays visible while
  // a Pages Router getStaticProps re-runs (the 2s delay on the `second` slug
  // keeps that window open). But Pages Router drives no indicator during the
  // data fetch: the only thing that ever appears is the brief recompile of the
  // edited file, which the assertion catches incidentally via `data-status`. So
  // it only ever asserts the compiling indicator, not a data-fetch one. And
  // because `data-status` reflects the visible indicator, which has a short
  // anti-flicker delay the recompile does not reliably outlast, whether that
  // recompile is caught at all is non-deterministic: it shows in a full-suite
  // run but not in isolation or on CI. That makes the assertion flaky, and a
  // failure here corrupts the shared fixture for the next test. Re-enable with
  // a deterministic check once a data re-fetch actually surfaces an indicator.
  it.skip('should show indicator when re-fetching data', async () => {
    const browser = await next.browser('/gsp-blog/second')
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
    const browser = await next.browser('/gsp-blog/first')
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
    const browser = await next.browser('/')
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
    const browser = await next.browser('/another')
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
    const browser = await next.browser('/another')
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
    const browser = await next.browser('/gssp-blog/first')
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
    const browser = await next.browser('/gssp-blog/first')
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
    const browser = await next.browser('/')
    await browser.eval(`window.beforeChange = 'hi'`)

    const props = JSON.parse(await browser.elementByCss('#props').text())
    expect(props.count).toBe(1)

    const page = 'pages/index.js'
    const originalContent = await next.readFile(page)

    try {
      await next.patchFile(page, originalContent.replace('props:', 'propss:'))

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "Additional keys were returned from \`getStaticProps\`. Properties intended for your component must be nested under the \`props\` key, e.g.:

       	return { props: { title: 'My Title', content: '...' } }

       Keys that need to be moved: propss.
       Read more: https://nextjs.org/docs/messages/invalid-getstaticprops-value",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)

      await next.patchFile(page, originalContent)
      await waitForNoRedbox(browser)
    } finally {
      await next.patchFile(page, originalContent)
    }
  })

  it('should update on thrown error in getStaticProps', async () => {
    const browser = await next.browser('/')
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

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "custom oops",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": "pages/index.js (18:9) @ getStaticProps
       > 18 |   throw new Error("custom oops"); const count = 1
            |         ^",
         "stack": [
           "getStaticProps pages/index.js (18:9)",
         ],
       }
      `)
      expect(next.cliOutput).toMatch(/custom oops/)

      await next.patchFile(page, originalContent)
      await waitForNoRedbox(browser)
    } finally {
      await next.patchFile(page, originalContent)
    }
  })

  it('should refresh data when server import is updated', async () => {
    const browser = await next.browser('/')
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
