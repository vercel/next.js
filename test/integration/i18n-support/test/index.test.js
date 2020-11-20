import url from 'url'
import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { runTests, locales } from './shared'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  getPageFileFromPagesManifest,
  fetchViaHTTP,
  File,
  launchApp,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
const ctx = {
  basePath: '',
  appDir,
}

describe('i18n Support', () => {
  beforeAll(async () => {
    ctx.externalPort = await findPort()
    ctx.externalApp = http.createServer((req, res) => {
      res.statusCode = 200
      res.end(JSON.stringify({ url: req.url, external: true }))
    })
    await new Promise((resolve, reject) => {
      ctx.externalApp.listen(ctx.externalPort, (err) =>
        err ? reject(err) : resolve()
      )
    })
  })
  afterAll(() => ctx.externalApp.close())

  describe('dev mode', () => {
    const curCtx = {
      ...ctx,
      isDev: true,
    }
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace(/__EXTERNAL_PORT__/g, ctx.externalPort)
      curCtx.appPort = await findPort()
      curCtx.app = await launchApp(appDir, curCtx.appPort)
      curCtx.buildId = 'development'
    })
    afterAll(async () => {
      await killApp(curCtx.app)
      nextConfig.restore()
    })

    runTests(curCtx)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace(/__EXTERNAL_PORT__/g, ctx.externalPort)
      await nextBuild(appDir)
      ctx.appPort = await findPort()
      ctx.app = await nextStart(appDir, ctx.appPort)
      ctx.buildPagesDir = join(appDir, '.next/server/pages')
      ctx.buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      await killApp(ctx.app)
      nextConfig.restore()
    })

    runTests(ctx)
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace('// target', 'target')
      nextConfig.replace(/__EXTERNAL_PORT__/g, ctx.externalPort)

      await nextBuild(appDir)
      ctx.appPort = await findPort()
      ctx.app = await nextStart(appDir, ctx.appPort)
      ctx.buildPagesDir = join(appDir, '.next/serverless/pages')
      ctx.buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(ctx.app)
    })

    it('should have correct props for blocking notFound', async () => {
      const serverFile = getPageFileFromPagesManifest(
        appDir,
        '/not-found/blocking-fallback/[slug]'
      )
      const appPort = await findPort()
      const mod = require(join(appDir, '.next/serverless', serverFile))

      const server = http.createServer(async (req, res) => {
        try {
          await mod.render(req, res)
        } catch (err) {
          res.statusCode = 500
          res.end('internal err')
        }
      })

      await new Promise((resolve, reject) => {
        server.listen(appPort, (err) => (err ? reject(err) : resolve()))
      })
      console.log('listening on', appPort)

      const res = await fetchViaHTTP(
        appPort,
        '/nl/not-found/blocking-fallback/first'
      )
      server.close()

      expect(res.status).toBe(404)

      const $ = cheerio.load(await res.text())
      const props = JSON.parse($('#props').text())

      expect($('#not-found').text().length > 0).toBe(true)
      expect(props).toEqual({
        is404: true,
        locale: 'nl',
        locales,
        defaultLocale: 'en-US',
      })
    })

    it('should resolve rewrites correctly', async () => {
      const serverFile = getPageFileFromPagesManifest(appDir, '/another')
      const appPort = await findPort()
      const mod = require(join(appDir, '.next/serverless', serverFile))

      const server = http.createServer(async (req, res) => {
        try {
          await mod.render(req, res)
        } catch (err) {
          res.statusCode = 500
          res.end('internal err')
        }
      })

      await new Promise((resolve, reject) => {
        server.listen(appPort, (err) => (err ? reject(err) : resolve()))
      })
      console.log('listening on', appPort)

      const requests = await Promise.all(
        [
          '/en-US/rewrite-1',
          '/nl/rewrite-2',
          '/fr/rewrite-3',
          '/en-US/rewrite-4',
          '/fr/rewrite-4',
        ].map((path) =>
          fetchViaHTTP(appPort, `${ctx.basePath}${path}`, undefined, {
            redirect: 'manual',
          })
        )
      )

      server.close()

      const checks = [
        ['en-US', '/rewrite-1'],
        ['nl', '/rewrite-2'],
        ['nl', '/rewrite-3'],
        ['en-US', '/rewrite-4'],
        ['fr', '/rewrite-4'],
      ]

      for (let i = 0; i < requests.length; i++) {
        const res = requests[i]
        const [locale, asPath] = checks[i]
        const $ = cheerio.load(await res.text())
        expect($('html').attr('lang')).toBe(locale)
        expect($('#router-locale').text()).toBe(locale)
        expect($('#router-pathname').text()).toBe('/another')
        expect($('#router-as-path').text()).toBe(asPath)
      }
    })

    runTests(ctx)
  })

  describe('with localeDetection disabled', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace('// localeDetection', 'localeDetection')

      await nextBuild(appDir)
      ctx.appPort = await findPort()
      ctx.app = await nextStart(appDir, ctx.appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(ctx.app)
    })

    it('should have localeDetection in routes-manifest', async () => {
      const routesManifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )

      expect(routesManifest.i18n).toEqual({
        localeDetection: false,
        locales: ['en-US', 'nl-NL', 'nl-BE', 'nl', 'fr-BE', 'fr', 'en'],
        defaultLocale: 'en-US',
        domains: [
          {
            http: true,
            domain: 'example.be',
            defaultLocale: 'nl-BE',
            locales: ['nl', 'nl-NL', 'nl-BE'],
          },
          {
            http: true,
            domain: 'example.fr',
            defaultLocale: 'fr',
            locales: ['fr-BE'],
          },
        ],
      })
    })

    it('should not detect locale from accept-language', async () => {
      const res = await fetchViaHTTP(
        ctx.appPort,
        '/',
        {},
        {
          redirect: 'manual',
          headers: {
            'accept-language': 'fr',
          },
        }
      )

      expect(res.status).toBe(200)
      const $ = cheerio.load(await res.text())
      expect($('html').attr('lang')).toBe('en-US')
      expect($('#router-locale').text()).toBe('en-US')
      expect(JSON.parse($('#router-locales').text())).toEqual(locales)
      expect($('#router-pathname').text()).toBe('/')
      expect($('#router-as-path').text()).toBe('/')
    })

    it('should set locale from detected path', async () => {
      for (const locale of locales) {
        const res = await fetchViaHTTP(
          ctx.appPort,
          `/${locale}`,
          {},
          {
            redirect: 'manual',
            headers: {
              'accept-language': 'en-US,en;q=0.9',
            },
          }
        )

        expect(res.status).toBe(200)
        const $ = cheerio.load(await res.text())
        expect($('html').attr('lang')).toBe(locale)
        expect($('#router-locale').text()).toBe(locale)
        expect(JSON.parse($('#router-locales').text())).toEqual(locales)
        expect($('#router-pathname').text()).toBe('/')
        expect($('#router-as-path').text()).toBe('/')
      }
    })
  })

  describe('with trailingSlash: true', () => {
    const curCtx = {
      ...ctx,
      isDev: true,
    }
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace('// trailingSlash', 'trailingSlash')

      curCtx.appPort = await findPort()
      curCtx.app = await launchApp(appDir, curCtx.appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(curCtx.app)
    })

    it('should redirect correctly', async () => {
      for (const locale of locales) {
        const res = await fetchViaHTTP(curCtx.appPort, '/', undefined, {
          redirect: 'manual',
          headers: {
            'accept-language': locale,
          },
        })

        if (locale === 'en-US') {
          expect(res.status).toBe(200)
        } else {
          expect(res.status).toBe(307)

          const parsed = url.parse(res.headers.get('location'), true)
          expect(parsed.pathname).toBe(`/${locale}`)
          expect(parsed.query).toEqual({})
        }
      }
    })

    it('should serve pages correctly with locale prefix', async () => {
      for (const locale of locales) {
        for (const [pathname, asPath] of [
          ['/', '/'],
          ['/links', '/links/'],
          ['/auto-export', '/auto-export/'],
          ['/gsp', '/gsp/'],
          ['/gsp/fallback/[slug]', '/gsp/fallback/always/'],
          ['/gssp', '/gssp/'],
          ['/gssp/[slug]', '/gssp/first/'],
        ]) {
          const res = await fetchViaHTTP(
            curCtx.appPort,
            `${locale === 'en-US' ? '' : `/${locale}`}${asPath}`,
            undefined,
            {
              redirect: 'manual',
            }
          )
          expect(res.status).toBe(200)

          const $ = cheerio.load(await res.text())

          expect($('#router-pathname').text()).toBe(pathname)
          expect($('#router-as-path').text()).toBe(asPath)
          expect($('#router-locale').text()).toBe(locale)
          expect(JSON.parse($('#router-locales').text())).toEqual(locales)
          expect($('#router-default-locale').text()).toBe('en-US')
        }
      }
    })

    it('should navigate between pages correctly', async () => {
      for (const locale of locales) {
        const localePath = `/${locale !== 'en-US' ? `${locale}/` : ''}`
        const browser = await webdriver(curCtx.appPort, localePath)

        await browser.eval('window.beforeNav = 1')
        await browser.elementByCss('#to-gsp').click()
        await browser.waitForElementByCss('#gsp')

        expect(await browser.elementByCss('#router-pathname').text()).toBe(
          '/gsp'
        )
        expect(await browser.elementByCss('#router-as-path').text()).toBe(
          '/gsp/'
        )
        expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
        expect(await browser.eval('window.beforeNav')).toBe(1)
        expect(await browser.eval('window.location.pathname')).toBe(
          `${localePath}gsp/`
        )

        await browser.back().waitForElementByCss('#index')

        expect(await browser.elementByCss('#router-pathname').text()).toBe('/')
        expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
        expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
        expect(await browser.eval('window.beforeNav')).toBe(1)
        expect(await browser.eval('window.location.pathname')).toBe(
          `${localePath}`
        )

        await browser.elementByCss('#to-gssp-slug').click()
        await browser.waitForElementByCss('#gssp')

        expect(await browser.elementByCss('#router-pathname').text()).toBe(
          '/gssp/[slug]'
        )
        expect(await browser.elementByCss('#router-as-path').text()).toBe(
          '/gssp/first/'
        )
        expect(await browser.elementByCss('#router-locale').text()).toBe(locale)
        expect(await browser.eval('window.beforeNav')).toBe(1)
        expect(await browser.eval('window.location.pathname')).toBe(
          `${localePath}gssp/first/`
        )
      }
    })
  })
})
