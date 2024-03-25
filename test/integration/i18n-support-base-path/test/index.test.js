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
  afterAll(async () => {
    await new Promise((resolve, reject) =>
      ctx.externalApp.close((err) => {
        err ? reject(err) : resolve()
      })
    )
  })
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      const curCtx = {
        ...ctx,
        isDev: true,
      }
      beforeAll(async () => {
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
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
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
    }
  )

  describe('with localeDetection disabled', () => {
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
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
      }
    )
  })
})
