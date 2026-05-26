import http from 'http'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { runTests, locales, nonDomainLocales } from './shared'
import { findPort, fetchViaHTTP, retry } from 'next-test-utils'
import { nextTestSetup, isNextDev, type NextInstance } from 'e2e-utils'
import assert from 'assert'

type BrowserOptions = Parameters<NextInstance['browser']>[1]

describe('i18n Support', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  const ctx: Record<string, any> = {
    basePath: '',
    isDev: isNextDev,
    browser: (pathname: string, options?: BrowserOptions) =>
      next.browser(pathname, options),
  }

  let externalServer: http.Server
  let externalPort: number
  let origConfigContent: string

  beforeAll(async () => {
    externalPort = await findPort()
    externalServer = http.createServer((req, res) => {
      res.statusCode = 200
      res.end(JSON.stringify({ url: req.url, external: true }))
    })
    await new Promise<void>((resolve, reject) => {
      externalServer.listen(externalPort, (err?: Error) =>
        err ? reject(err) : resolve()
      )
    })

    await next.patchFile('next.config.js', (content) =>
      content.replace(/__EXTERNAL_PORT__/g, String(externalPort))
    )
    origConfigContent = await next.readFile('next.config.js')

    if (!isNextDev) {
      await next.build()
    }
    await next.start()

    ctx.appDir = next.testDir
    ctx.appPort = new URL(next.url).port
    if (!isNextDev) {
      ctx.buildId = (await next.readFile('.next/BUILD_ID')).trim()
      ctx.buildPagesDir = join(next.testDir, '.next/server/pages')
    } else {
      ctx.buildId = 'development'
    }
  })

  afterAll(() => {
    externalServer?.close()
  })

  runTests(ctx)

  if (!isNextDev) {
    it('should have pre-rendered /500 correctly', async () => {
      for (const locale of locales) {
        const content = await fs.readFile(
          join(next.testDir, '.next/server/pages/', locale, '500.html'),
          'utf8'
        )
        expect(content).toContain('500')
        expect(content).toMatch(/Internal Server Error/i)
      }
    })

    it('should have locale-prefixed pages-manifest entries for default 500', async () => {
      const manifest = await fs.readJSON(
        join(next.testDir, '.next/server/pages-manifest.json')
      )
      for (const locale of locales) {
        expect(manifest[`/${locale}/500`]).toBe(`pages/${locale}/500.html`)
      }
    })

    it('should not have non-locale-prefixed HTML files for auto-static pages', async () => {
      const pagesDir = join(next.testDir, '.next/server/pages')
      // auto-export is a non-SSG auto-static page; only locale-prefixed
      // variants should exist in server/pages/ (e.g. en-US/auto-export.html).
      // A bare auto-export.html would be an orphan that can interfere with routing.
      expect(await fs.pathExists(join(pagesDir, 'auto-export.html'))).toBe(
        false
      )
      for (const locale of locales) {
        expect(
          await fs.pathExists(join(pagesDir, locale, 'auto-export.html'))
        ).toBe(true)
      }
    })
  }

  describe('with localeDetection disabled', () => {
    if (!isNextDev) {
      beforeAll(async () => {
        await next.stop()
        await next.patchFile('next.config.js', (content) =>
          content.replace('// localeDetection', 'localeDetection')
        )
        await next.build()
        await next.start()
        ctx.appPort = new URL(next.url).port
      })

      afterAll(async () => {
        await next.stop()
        await next.patchFile('next.config.js', origConfigContent)
        await next.build()
        await next.start()
        ctx.appPort = new URL(next.url).port
      })

      it('should have localeDetection in routes-manifest', async () => {
        const routesManifest = JSON.parse(
          await next.readFile('.next/routes-manifest.json')
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
        await next.patchFile('next.config.js', (content) =>
          content.replace('localeDetection: false', 'localeDetection: true')
        )
        await next.stop()
        await next.build()
        await next.start()
        ctx.appPort = new URL(next.url).port

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
  })

  describe('with trailingSlash: true', () => {
    const runSlashTests = (curCtx) => {
      if (!curCtx.isDev) {
        it('should preload all locales data correctly', async () => {
          const browser = await curCtx.browser(`${curCtx.basePath}/mixed`)

          await browser.eval(`(function() {
            document.querySelector('#to-gsp-en-us').scrollIntoView()
            document.querySelector('#to-gsp-nl-nl').scrollIntoView()
            document.querySelector('#to-gsp-fr').scrollIntoView()
          })()`)

          await retry(async () => {
            const hrefs = await browser.eval(
              `Object.keys(window.next.router.sdc)`
            )
            hrefs.sort()

            const baseURL = await browser.url()
            assert.deepEqual(
              hrefs.map((href) =>
                new URL(href, baseURL).pathname
                  .replace(ctx.basePath, '')
                  .replace(/^\/_next\/data\/[^/]+/, '')
              ),
              ['/en-US/gsp.json', '/fr.json', '/fr/gsp.json', '/nl-NL/gsp.json']
            )
          })
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

            const parsed = new URL(res.headers.get('location'), res.url)
            expect(parsed.pathname).toBe(`/${locale}/`)
            expect(Object.fromEntries(parsed.searchParams.entries())).toEqual(
              {}
            )
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
          const browser = await curCtx.browser(localePath)

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

    beforeAll(async () => {
      await next.stop()
      await next.patchFile('next.config.js', (content) =>
        content.replace('// trailingSlash', 'trailingSlash')
      )
      if (!isNextDev) {
        await next.build()
      }
      await next.start()
      ctx.appPort = new URL(next.url).port
    })

    afterAll(async () => {
      await next.stop()
      await next.patchFile('next.config.js', origConfigContent)
    })

    runSlashTests(ctx)
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

            const parsed = new URL(res.headers.get('location'), res.url)
            expect(parsed.pathname).toBe(`/${locale}`)
            expect(Object.fromEntries(parsed.searchParams.entries())).toEqual(
              {}
            )
          }
        }
      })
    }

    beforeAll(async () => {
      await next.stop()
      await next.patchFile('next.config.js', (content) =>
        content.replace('// trailingSlash: true', 'trailingSlash: false')
      )
      if (!isNextDev) {
        await next.build()
      }
      await next.start()
      ctx.appPort = new URL(next.url).port
    })

    afterAll(async () => {
      await next.stop()
      await next.patchFile('next.config.js', origConfigContent)
    })

    runSlashTests(ctx)
  })

  if (!isNextDev) {
    describe('error configs', () => {
      it('should show proper error for duplicate defaultLocales', async () => {
        await next.stop()
        const origContent = await next.readFile('next.config.js')
        await next.patchFile(
          'next.config.js',
          `
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
    `
        )

        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(
          'Both fr.example.com and french.example.com configured the defaultLocale fr but only one can'
        )
        await next.patchFile('next.config.js', origContent)
      })

      it('should show proper error for duplicate locales', async () => {
        const origContent = await next.readFile('next.config.js')
        await next.patchFile(
          'next.config.js',
          `
      module.exports = {
        i18n: {
          locales: ['en', 'fr', 'nl', 'eN', 'fr'],
          defaultLocale: 'en',
        }
      }
    `
        )

        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(
          'Specified i18n.locales contains the following duplicate locales:'
        )
        expect(next.cliOutput).toContain(`eN, fr`)
        await next.patchFile('next.config.js', origContent)
      })

      it('should show proper error for invalid locale domain', async () => {
        const origContent = await next.readFile('next.config.js')
        await next.patchFile(
          'next.config.js',
          `
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
    `
        )

        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
        expect(next.cliOutput).toContain(
          `i18n domain: "hello:3000" is invalid it should be a valid domain without protocol (https://) or port (:3000) e.g. example.vercel.sh`
        )
        await next.patchFile('next.config.js', origContent)
      })
    })
  }
})
