/* eslint-env jest */

import webdriver from 'next-webdriver'

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  renderViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  File,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

function testShouldRedirect(expectations) {
  it.each(expectations)(
    '%s should redirect to %s',
    async (route, expectedLocation) => {
      const res = await fetchViaHTTP(appPort, route, {}, { redirect: 'manual' })
      expect(res.status).toBe(308)
      const { pathname } = new URL(res.headers.get('location'))
      expect(pathname).toBe(expectedLocation)
    }
  )
}

function testShouldResolve(expectations) {
  it.each(expectations)(
    '%s should resolve to %s, with router path %s',
    async (route, expectedPage, expectedRouterPath) => {
      const res = await fetchViaHTTP(appPort, route, {}, { redirect: 'error' })
      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('#page-marker').text()).toBe(expectedPage)
      expect($('#router-pathname').text()).toBe(expectedRouterPath)
    }
  )

  it.each(expectations)(
    '%s should client side render %s, with router path %s',
    async (route, expectedPage, expectedRouterPath) => {
      let browser
      try {
        browser = await webdriver(appPort, route)

        await browser.waitForElementByCss('#hydration-marker')
        const text = await browser.elementByCss('#page-marker').text()
        expect(text).toBe(expectedPage)
        const routerPathname = await browser
          .elementByCss('#router-pathname')
          .text()
        expect(routerPathname).toBe(expectedRouterPath)
      } finally {
        if (browser) await browser.close()
      }
    }
  )
}

function testLinkShouldRewriteTo(expectations) {
  it.each(expectations)(
    '%s should have href %s',
    async (linkPage, expectedHref) => {
      const content = await renderViaHTTP(appPort, linkPage)
      const $ = cheerio.load(content)
      expect($('#link').attr('href')).toBe(expectedHref)
    }
  )

  it.each(expectations)(
    '%s should navigate to %s',
    async (linkPage, expectedHref) => {
      let browser
      try {
        browser = await webdriver(appPort, linkPage)
        await browser.elementByCss('#link').click()

        await browser.waitForElementByCss('#hydration-marker')
        const url = new URL(await browser.eval('window.location.href'))
        const pathname = url.href.slice(url.origin.length)
        expect(pathname).toBe(expectedHref)
      } finally {
        if (browser) await browser.close()
      }
    }
  )

  it.each(expectations)(
    '%s should push route to %s',
    async (linkPage, expectedHref) => {
      let browser
      try {
        browser = await webdriver(appPort, linkPage)
        await browser.elementByCss('#route-pusher').click()

        await browser.waitForElementByCss('#hydration-marker')
        const url = new URL(await browser.eval('window.location.href'))
        const pathname = url.href.slice(url.origin.length)
        expect(pathname).toBe(expectedHref)
      } finally {
        if (browser) await browser.close()
      }
    }
  )
}

function testWithoutTrailingSlash() {
  testShouldRedirect([
    ['/about/', '/about'],
    ['/catch-all/hello/world/', '/catch-all/hello/world'],
    ['/catch-all/hello.world/', '/catch-all/hello.world'],
  ])

  testShouldResolve([
    // visited url, expected page, expected router path
    ['/', '/index.js', '/'],
    ['/about', '/about.js', '/about'],
    [
      '/catch-all/hello/world',
      '/catch-all/[...slug].js',
      '/catch-all/[...slug]',
    ],
    ['/about?hello=world', '/about.js', '/about'],
  ])

  testLinkShouldRewriteTo([
    ['/linker?href=/', '/'],
    ['/linker?href=/about', '/about'],
    ['/linker?href=/about/', '/about'],
    ['/linker?href=/about?hello=world', '/about?hello=world'],
    ['/linker?href=/about/?hello=world', '/about?hello=world'],
    ['/linker?href=/catch-all/hello/', '/catch-all/hello'],
    ['/linker?href=/catch-all/hello.world/', '/catch-all/hello.world'],
  ])
}

function testWithTrailingSlash() {
  testShouldRedirect([
    ['/about', '/about/'],
    ['/catch-all/hello/world', '/catch-all/hello/world/'],
    ['/catch-all/hello.world/', '/catch-all/hello.world'],
  ])

  testShouldResolve([
    // visited url, expected page, expected router path
    ['/', '/index.js', '/'],
    ['/about/', '/about.js', '/about'],
    [
      '/catch-all/hello/world/',
      '/catch-all/[...slug].js',
      '/catch-all/[...slug]',
    ],
    ['/about/?hello=world', '/about.js', '/about'],
  ])

  testLinkShouldRewriteTo([
    ['/linker?href=/', '/'],
    ['/linker?href=/about', '/about/'],
    ['/linker?href=/about/', '/about/'],
    ['/linker?href=/about?hello=world', '/about/?hello=world'],
    ['/linker?href=/about/?hello=world', '/about/?hello=world'],
    ['/linker?href=/catch-all/hello/', '/catch-all/hello/'],
    ['/linker?href=/catch-all/hello.world/', '/catch-all/hello.world'],
  ])
}

describe('Trailing slashes', () => {
  describe('dev mode, trailingSlash: false', () => {
    beforeAll(async () => {
      nextConfig.replace('// trailingSlash: boolean', 'trailingSlash: false')
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    testWithoutTrailingSlash()
  })

  describe('dev mode, trailingSlash: true', () => {
    beforeAll(async () => {
      nextConfig.replace('// trailingSlash: boolean', 'trailingSlash: true')
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    testWithTrailingSlash()
  })

  describe('production mode, trailingSlash: false', () => {
    beforeAll(async () => {
      nextConfig.replace('// trailingSlash: boolean', 'trailingSlash: false')
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    testWithoutTrailingSlash()

    it('should have a redirect in the routesmanifest', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next', 'routes-manifest.json')
      )
      expect(manifest).toEqual(
        expect.objectContaining({
          redirects: expect.arrayContaining([
            expect.objectContaining({
              source: '/:path+/',
              destination: '/:path+',
              statusCode: 308,
            }),
          ]),
        })
      )
    })
  })

  describe('production mode, trailingSlash: true', () => {
    beforeAll(async () => {
      nextConfig.replace('// trailingSlash: boolean', 'trailingSlash: true')
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    testWithTrailingSlash()

    it('should have a redirect in the routesmanifest', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next', 'routes-manifest.json')
      )
      expect(manifest).toEqual(
        expect.objectContaining({
          redirects: expect.arrayContaining([
            expect.objectContaining({
              source: '/:file((?:[^/]+/)*[^/]+\\.\\w+)/',
              destination: '/:file',
              statusCode: 308,
            }),
            expect.objectContaining({
              source: '/:notfile((?:[^/]+/)*[^/\\.]+)',
              destination: '/:notfile/',
              statusCode: 308,
            }),
          ]),
        })
      )
    })
  })

  describe('dev mode, with basepath, trailingSlash: true', () => {
    beforeAll(async () => {
      nextConfig.replace('// trailingSlash: boolean', 'trailingSlash: true')
      nextConfig.replace('// basePath:', 'basePath:')
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    testShouldRedirect([
      ['/docs/about', '/docs/about/'],
      ['/docs', '/docs/'],
      ['/docs/catch-all/hello/world', '/docs/catch-all/hello/world/'],
      ['/docs/catch-all/hello.world/', '/docs/catch-all/hello.world'],
    ])

    testLinkShouldRewriteTo([
      ['/docs/linker?href=/about', '/docs/about/'],
      ['/docs/linker?href=/', '/docs/'],
    ])
  })

  describe('production mode, with basepath, trailingSlash: true', () => {
    beforeAll(async () => {
      nextConfig.replace('// trailingSlash: boolean', 'trailingSlash: true')
      nextConfig.replace('// basePath:', 'basePath:')
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(app)
    })

    testShouldRedirect([
      ['/docs/about', '/docs/about/'],
      ['/docs', '/docs/'],
      ['/docs/catch-all/hello/world', '/docs/catch-all/hello/world/'],
      ['/docs/catch-all/hello.world/', '/docs/catch-all/hello.world'],
    ])

    testLinkShouldRewriteTo([
      ['/docs/linker?href=/about', '/docs/about/'],
      ['/docs/linker?href=/', '/docs/'],
    ])
  })
})
