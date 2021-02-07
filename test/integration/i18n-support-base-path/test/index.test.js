import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { runTests, locales } from '../../i18n-support/test/shared'
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
  basePath: '/docs',
  appDir,
}

describe('i18n Support basePath', () => {
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

  describe('dev mode', () => {
    const curCtx = {
      ...ctx,
      isDev: true,
    }
    beforeAll(async () => {
      nextConfig.replace('// basePath', 'basePath')
      nextConfig.replace(/__EXTERNAL_PORT__/g, ctx.externalPort)
      await fs.remove(join(appDir, '.next'))
      curCtx.appPort = await findPort()
      curCtx.app = await launchApp(appDir, curCtx.appPort)
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(curCtx.app)
    })

    runTests(curCtx)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      nextConfig.replace('// basePath', 'basePath')
      nextConfig.replace(/__EXTERNAL_PORT__/g, ctx.externalPort)
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir)
      ctx.appPort = await findPort()
      ctx.app = await nextStart(appDir, ctx.appPort)
      ctx.buildPagesDir = join(appDir, '.next/server/pages')
      ctx.buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(async () => {
      nextConfig.restore()
      await killApp(ctx.app)
    })

    runTests(ctx)
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      nextConfig.replace('// target', 'target')
      nextConfig.replace('// basePath', 'basePath')
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
        `${ctx.basePath}/nl/not-found/blocking-fallback/first`
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
      nextConfig.replace('// basePath', 'basePath')
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
        locales: [
          'en-US',
          'nl-NL',
          'nl-BE',
          'nl',
          'fr-BE',
          'fr',
          'en',
          'go',
          'go-BE',
          'do',
          'do-BE',
        ],
        defaultLocale: 'en-US',
        domains: [
          {
            http: true,
            domain: 'example.do',
            defaultLocale: 'do',
            locales: ['do-BE'],
          },
          {
            domain: 'example.com',
            defaultLocale: 'go',
            locales: ['go-BE'],
          },
        ],
      })
    })

    it('should not detect locale from accept-language', async () => {
      const res = await fetchViaHTTP(
        ctx.appPort,
        `${ctx.basePath || '/'}`,
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
          `${ctx.basePath}/${locale}`,
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
})
