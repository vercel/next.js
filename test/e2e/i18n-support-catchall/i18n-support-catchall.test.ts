import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import assert from 'assert'
import fs from 'fs'
import { join } from 'path'

describe('i18n Support Root Catch-all', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  const locales = ['en-US', 'nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en']

  it('should load the index route correctly SSR', async () => {
    const res = await next.fetch('/', { redirect: 'manual' })
    expect(res.status).toBe(200)

    const $ = await next.render$('/')

    expect($('#router-locale').text()).toBe('en-US')
    expect($('#router-default-locale').text()).toBe('en-US')
    expect($('#router-pathname').text()).toBe('/[[...slug]]')
    expect($('#router-as-path').text()).toBe('/')
    expect(JSON.parse($('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
    expect(JSON.parse($('#router-locales').text())).toEqual(locales)
  })

  it('should load the index route correctly CSR', async () => {
    const browser = await next.browser('/')

    expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
  })

  it('should navigate to other locale index and back', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#to-locale-index').click()

    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe('/nl-NL')
    })

    expect(await browser.elementByCss('#router-locale').text()).toBe('nl-NL')
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'nl-NL',
      locales,
      defaultLocale: 'en-US',
    })

    await browser.back()

    await retry(async () => {
      expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    })

    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
  })

  it('should navigate to other locale page and back', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#to-locale-another').click()

    await retry(async () => {
      expect(await browser.eval('window.location.pathname')).toBe(
        '/nl-NL/another'
      )
    })

    // The URL can update before the component re-renders with the new locale
    // (observed with webpack production builds). Wait for the render to
    // reflect the new locale before asserting the rest of the router state.
    await retry(async () => {
      expect(await browser.elementByCss('#router-locale').text()).toBe('nl-NL')
    })
    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe(
      '/another'
    )
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {
        slug: ['another'],
      },
      locale: 'nl-NL',
      locales,
      defaultLocale: 'en-US',
    })

    await browser.back()

    await retry(async () => {
      expect(await browser.elementByCss('#router-locale').text()).toBe('en-US')
    })

    expect(await browser.elementByCss('#router-default-locale').text()).toBe(
      'en-US'
    )
    expect(await browser.elementByCss('#router-pathname').text()).toBe(
      '/[[...slug]]'
    )
    expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
    expect(
      JSON.parse(await browser.elementByCss('#router-locales').text())
    ).toEqual(locales)
    expect(JSON.parse(await browser.elementByCss('#props').text())).toEqual({
      params: {},
      locale: 'en-US',
      locales,
      defaultLocale: 'en-US',
    })
  })

  if (isNextStart) {
    it('should output prerendered index routes correctly', async () => {
      const buildPagesDir = join(next.testDir, '.next/server')
      expect(fs.existsSync(join(buildPagesDir, 'pages/en-US.html'))).toBe(true)
      expect(fs.existsSync(join(buildPagesDir, 'pages/en-US.json'))).toBe(true)
      expect(fs.existsSync(join(buildPagesDir, 'pages/fr.html'))).toBe(true)
      expect(fs.existsSync(join(buildPagesDir, 'pages/fr.json'))).toBe(true)
    })

    it('should preload data correctly', async () => {
      const browser = await next.browser('/')

      await browser.eval(`(function() {
        document.querySelector('#to-def-locale-index').scrollIntoView()
        document.querySelector('#to-def-locale-another').scrollIntoView()
        document.querySelector('#to-locale-index').scrollIntoView()
        document.querySelector('#to-locale-another').scrollIntoView()
        document.querySelector('#to-fr-locale-another').scrollIntoView()
        document.querySelector('#to-fr-locale-index').scrollIntoView()
      })()`)

      await retry(async () => {
        const hrefs = await browser.eval(`Object.keys(window.next.router.sdc)`)
        hrefs.sort()

        assert.deepEqual(
          hrefs.map((href) =>
            new URL(href).pathname.replace(/^\/_next\/data\/[^/]+/, '')
          ),
          [
            '/en-US.json',
            '/en-US/another.json',
            '/fr.json',
            '/fr/another.json',
            '/nl-NL.json',
            '/nl-NL/another.json',
          ]
        )
      })
    })
  }
})
