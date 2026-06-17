import http from 'http'
import { join } from 'path'
import cheerio from 'cheerio'
import { runTests, locales } from '../i18n-support/shared'
import { findPort, fetchViaHTTP } from 'next-test-utils'
import { nextTestSetup, isNextDev, type NextInstance } from 'e2e-utils'

type BrowserOptions = Parameters<NextInstance['browser']>[1]

describe('i18n Support basePath', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  const ctx: Record<string, any> = {
    basePath: '/docs',
    isDev: isNextDev,
    browser: (pathname: string, options?: BrowserOptions) =>
      next.browser(pathname, options),
  }

  let externalServer: http.Server
  let externalPort: number

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

    if (!isNextDev) {
      await next.build()
    }
    await next.start()

    ctx.appDir = next.testDir
    ctx.appPort = Number(new URL(next.url).port)
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
  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    runTests(ctx)
  })
  ;(!isNextDev ? describe : describe.skip)('production mode', () => {
    runTests(ctx)
  })

  describe('with localeDetection disabled', () => {
    if (!isNextDev) {
      beforeAll(async () => {
        await next.stop()
        await next.patchFile('next.config.js', (content) =>
          content.replace('// localeDetection', 'localeDetection')
        )
        await next.build()
        await next.start()
        ctx.appPort = Number(new URL(next.url).port)
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
  })
})
