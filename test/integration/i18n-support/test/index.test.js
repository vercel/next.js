import url from 'url'
import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { runTests, locales, nonDomainLocales } from './shared'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  fetchViaHTTP,
  File,
  launchApp,
  check,
} from 'next-test-utils'
import assert from 'assert'

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
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
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
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
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

      it('should have pre-rendered /500 correctly', async () => {
        for (const locale of locales) {
          const content = await fs.readFile(
            join(appDir, '.next/server/pages/', locale, '500.html'),
            'utf8'
          )
          expect(content).toContain('500')
          expect(content).toMatch(/Internal Server Error/i)
        }
      })
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

        it('should ignore the invalid accept-language header', async () => {
          nextConfig.replace('localeDetection: false', 'localeDetection: true')
          const res = await fetchViaHTTP(
            ctx.appPort,
            '/',
            {},
            {
              headers: {
                'accept-language': 'ldfir;',
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
          for (const locale of nonDomainLocales) {
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
      }
    )
  })

  describe('with trailingSlash: true', () => {
    const runSlashTests = (curCtx) => {
      if (!curCtx.isDev) {
        it('should preload all locales data correctly', async () => {
          const browser = await webdriver(
            curCtx.appPort,
            `${curCtx.basePath}/mixed`
          )

          await browser.eval(`(function() {
            document.querySelector('#to-gsp-en-us').scrollIntoView()
            document.querySelector('#to-gsp-nl-nl').scrollIntoView()
            document.querySelector('#to-gsp-fr').scrollIntoView()
          })()`)

          await check(async () => {
            const hrefs = await browser.eval(
              `Object.keys(window.next.router.sdc)`
            )
            hrefs.sort()

            assert.deepEqual(
              hrefs.map((href) =>
                new URL(href).pathname
                  .replace(ctx.basePath, '')
                  .replace(/^\/_next\/data\/[^/]+/, '')
              ),
              ['/en-US/gsp.json', '/fr.json', '/fr/gsp.json', '/nl-NL/gsp.json']
            )
            return 'yes'
          }, 'yes')
        })

        it('should have correct locale domain hrefs', async () => {
          const res = await fetchViaHTTP(
            curCtx.appPort,
            '/do-BE/frank/',
            undefined,
            {
              redirect: 'manual',
            }
          )
          expect(res.status).toBe(200)

          const html = await res.text()
          const $ = cheerio.load(html)

          expect($('#to-fallback-hello')[0].attribs.href).toBe(
            'http://example.do/do-BE/gsp/fallback/hello/'
          )
          expect($('#to-no-fallback-first')[0].attribs.href).toBe(
            'http://example.do/do-BE/gsp/no-fallback/first/'
          )
        })
      }

      it('should redirect correctly', async () => {
        for (const locale of nonDomainLocales) {
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
            expect(parsed.pathname).toBe(`/${locale}/`)
            expect(parsed.query).toEqual({})
          }
        }
      })

      it('should serve pages correctly with locale prefix', async () => {
        for (const locale of nonDomainLocales) {
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

      it('should return 404 error for repeating locales', async () => {
        const defaultLocale = 'en-US'
        for (const locale of nonDomainLocales) {
          for (const asPath of [
            '/gsp/fallback/always/',
            '/post/comment/',
            '/gssp/first/',
          ]) {
            const res = await fetchViaHTTP(
              curCtx.appPort,
              `/${locale}/${defaultLocale}${asPath}`,
              undefined,
              {
                redirect: 'manual',
              }
            )
            expect(res.status).toBe(404)
            const $ = cheerio.load(await res.text())
            const props = JSON.parse($('#props').text())
            expect($('#not-found').text().length > 0).toBe(true)
            expect(props).toEqual({
              is404: true,
              locale,
              locales,
              defaultLocale,
            })
          }
        }
      })

      it('should navigate between pages correctly', async () => {
        for (const locale of nonDomainLocales) {
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
          expect(await browser.elementByCss('#router-locale').text()).toBe(
            locale
          )
          expect(await browser.eval('window.beforeNav')).toBe(1)
          expect(await browser.eval('window.location.pathname')).toBe(
            `${localePath}gsp/`
          )

          await browser.back().waitForElementByCss('#index')

          expect(await browser.elementByCss('#router-pathname').text()).toBe(
            '/'
          )
          expect(await browser.elementByCss('#router-as-path').text()).toBe('/')
          expect(await browser.elementByCss('#router-locale').text()).toBe(
            locale
          )
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
          expect(await browser.elementByCss('#router-locale').text()).toBe(
            locale
          )
          expect(await browser.eval('window.beforeNav')).toBe(1)
          expect(await browser.eval('window.location.pathname')).toBe(
            `${localePath}gssp/first/`
          )

          await browser.back().waitForElementByCss('#index')
          await browser.elementByCss('#to-api-post').click()

          await browser.waitForCondition(
            'window.location.pathname === "/api/post/asdf/"'
          )
          const body = await browser.elementByCss('body').text()
          const json = JSON.parse(body)
          expect(json.post).toBe(true)
        }
      })
    }

    ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
      'development mode',
      () => {
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

        runSlashTests(curCtx)
      }
    )
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const curCtx = {
          ...ctx,
        }
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          nextConfig.replace('// trailingSlash', 'trailingSlash')

          await nextBuild(appDir)
          curCtx.appPort = await findPort()
          curCtx.app = await nextStart(appDir, curCtx.appPort)
        })
        afterAll(async () => {
          nextConfig.restore()
          await killApp(curCtx.app)
        })

        runSlashTests(curCtx)
      }
    )
  })

  describe('with trailingSlash: false', () => {
    const runSlashTests = (curCtx) => {
      it('should redirect correctly', async () => {
        for (const locale of nonDomainLocales) {
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
    }

    ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
      'development mode',
      () => {
        const curCtx = {
          ...ctx,
          isDev: true,
        }
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          nextConfig.replace('// trailingSlash: true', 'trailingSlash: false')

          curCtx.appPort = await findPort()
          curCtx.app = await launchApp(appDir, curCtx.appPort)
        })
        afterAll(async () => {
          nextConfig.restore()
          await killApp(curCtx.app)
        })

        runSlashTests(curCtx)
      }
    )
    ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
      'production mode',
      () => {
        const curCtx = { ...ctx }
        beforeAll(async () => {
          await fs.remove(join(appDir, '.next'))
          nextConfig.replace('// trailingSlash: true', 'trailingSlash: false')

          await nextBuild(appDir)
          curCtx.appPort = await findPort()
          curCtx.app = await nextStart(appDir, curCtx.appPort)
        })
        afterAll(async () => {
          nextConfig.restore()
          await killApp(curCtx.app)
        })

        runSlashTests(curCtx)
      }
    )
  })
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      it('should show proper error for duplicate defaultLocales', async () => {
        nextConfig.write(`
      module.exports = {
        i18n: {
          locales: ['en', 'fr', 'nl'],
          defaultLocale: 'en',
          domains: [
            {
              domain: 'example.com',
              defaultLocale: 'en'
            },
            {
              domain: 'fr.example.com',
              defaultLocale: 'fr',
            },
            {
              domain: 'french.example.com',
              defaultLocale: 'fr',
            }
          ]
        }
      }
    `)

        const { code, stderr } = await nextBuild(appDir, undefined, {
          stderr: true,
        })
        nextConfig.restore()
        expect(code).toBe(1)
        expect(stderr).toContain(
          'Both fr.example.com and french.example.com configured the defaultLocale fr but only one can'
        )
      })

      it('should show proper error for duplicate locales', async () => {
        nextConfig.write(`
      module.exports = {
        i18n: {
          locales: ['en', 'fr', 'nl', 'eN', 'fr'],
          defaultLocale: 'en',
        }
      }
    `)

        const { code, stderr } = await nextBuild(appDir, undefined, {
          stderr: true,
        })
        nextConfig.restore()
        expect(code).toBe(1)
        expect(stderr).toContain(
          'Specified i18n.locales contains the following duplicate locales:'
        )
        expect(stderr).toContain(`eN, fr`)
      })

      it('should show proper error for invalid locale domain', async () => {
        nextConfig.write(`
      module.exports = {
        i18n: {
          locales: ['en', 'fr', 'nl', 'eN', 'fr'],
          domains: [
            {
              domain: 'hello:3000',
              defaultLocale: 'en',
            }
          ],
          defaultLocale: 'en',
        }
      }
    `)

        const { code, stderr } = await nextBuild(appDir, undefined, {
          stderr: true,
        })
        nextConfig.restore()
        expect(code).toBe(1)
        expect(stderr).toContain(
          `i18n domain: "hello:3000" is invalid it should be a valid domain without protocol (https://) or port (:3000) e.g. example.vercel.sh`
        )
      })
    }
  )
})
