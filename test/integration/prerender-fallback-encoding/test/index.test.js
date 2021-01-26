/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  killApp,
  findPort,
  nextBuild,
  launchApp,
  nextStart,
  fetchViaHTTP,
  check,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let app
let appPort
let buildId

// paths on the filesystem
const prerenderedPaths = [
  '%2Fmy-post%2F',
  '%252Fmy-post%252F',
  '+my-post+',
  '%3Fmy-post%3F',
  '&my-post&',
  '商業日語',
  encodeURIComponent('商業日語'),
  ' my-post ',
  '%2Fsecond-post%2F',
  '+second-post+',
  '&second-post&',
  'mixed-商業日語',
]

// paths that should be requested in the URL
const urlPaths = [
  '%2Fmy-post%2F',
  '%252Fmy-post%252F',
  '%2Bmy-post%2B',
  '%3Fmy-post%3F',
  '%26my-post%26',
  encodeURIComponent('商業日語'),
  encodeURIComponent(encodeURIComponent('商業日語')),
  '%20my-post%20',
  '%2Fsecond-post%2F',
  '%2Bsecond-post%2B',
  '%26second-post%26',
  `mixed-${encodeURIComponent('商業日語')}`,
]

const modePaths = ['fallback-blocking', 'fallback-false', 'fallback-true']
const pagesDir = join(appDir, '.next/server/pages')

function runTests(isDev) {
  if (!isDev) {
    it('should output paths correctly', async () => {
      for (const path of prerenderedPaths) {
        for (const mode of modePaths) {
          console.log('checking output', { path, mode })
          expect(await fs.exists(join(pagesDir, mode, path + '.html'))).toBe(
            true
          )
          expect(await fs.exists(join(pagesDir, mode, path + '.json'))).toBe(
            true
          )
        }
      }
    })

    it('should handle non-prerendered paths correctly', async () => {
      const prerenderedPaths = [
        '%2Fanother-post%2F',
        '+another-post+',
        '%3Fanother-post%3F',
        '&another-post&',
        '商業日語商業日語',
      ]

      const urlPaths = [
        '%2Fanother-post%2F',
        '%2Banother-post%2B',
        '%3Fanother-post%3F',
        '%26another-post%26',
        encodeURIComponent('商業日語商業日語'),
      ]

      for (const mode of modePaths) {
        for (let i = 0; i < urlPaths.length; i++) {
          const testSlug = urlPaths[i]
          const path = prerenderedPaths[i]

          const res = await fetchViaHTTP(
            appPort,
            `/_next/data/${buildId}/${mode}/${testSlug}.json`
          )

          if (mode === 'fallback-false') {
            expect(res.status).toBe(404)
          } else {
            expect(res.status).toBe(200)

            const { pageProps: props } = await res.json()

            expect(props.params).toEqual({
              slug: decodeURIComponent(testSlug),
            })

            if (!isDev) {
              // we don't block on writing incremental data to the
              // disk so use check
              await check(
                () =>
                  fs
                    .exists(join(pagesDir, mode, path + '.html'))
                    .then((res) => (res ? 'yes' : 'no')),
                'yes'
              )
              await check(
                () =>
                  fs
                    .exists(join(pagesDir, mode, path + '.json'))
                    .then((res) => (res ? 'yes' : 'no')),
                'yes'
              )
            }

            const browser = await webdriver(appPort, `/${mode}/${testSlug}`)

            expect(
              JSON.parse(await browser.elementByCss('#props').text()).params
            ).toEqual({
              slug: decodeURIComponent(testSlug),
            })

            const browserRouter = JSON.parse(
              await browser.elementByCss('#router').text()
            )

            expect(browserRouter.pathname).toBe(`/${mode}/[slug]`)
            expect(browserRouter.asPath).toBe(`/${mode}/${testSlug}`)
            expect(browserRouter.query).toEqual({
              slug: decodeURIComponent(testSlug),
            })
          }
        }
      }
    })
  }

  it('should respond with the prerendered pages correctly', async () => {
    for (let i = 0; i < urlPaths.length; i++) {
      const testSlug = urlPaths[i]

      for (const mode of modePaths) {
        const res = await fetchViaHTTP(
          appPort,
          `/${mode}/${testSlug}`,
          undefined,
          {
            redirect: 'manual',
          }
        )

        console.log('checking', { mode, testSlug })

        expect(res.status).toBe(200)

        const $ = cheerio.load(await res.text())

        expect(JSON.parse($('#props').text()).params).toEqual({
          slug: decodeURIComponent(testSlug),
        })
        const router = JSON.parse($('#router').text())

        expect(router.pathname).toBe(`/${mode}/[slug]`)
        expect(router.asPath).toBe(`/${mode}/${testSlug}`)
        expect(router.query).toEqual({
          slug: decodeURIComponent(testSlug),
        })
      }
    }
  })

  it('should respond with the prerendered data correctly', async () => {
    for (const path of urlPaths) {
      for (const mode of modePaths) {
        const res = await fetchViaHTTP(
          appPort,
          `/_next/data/${buildId}/${mode}/${path}.json`,
          undefined,
          {
            redirect: 'manual',
          }
        )
        expect(res.status).toBe(200)

        const { pageProps: props } = await res.json()

        expect(props.params).toEqual({
          slug: decodeURIComponent(path),
        })
      }
    }
  })

  it('should render correctly in the browser for prerender paths', async () => {
    for (let i = 0; i < urlPaths.length; i++) {
      const testSlug = urlPaths[i]

      for (const mode of modePaths) {
        const browser = await webdriver(appPort, `/${mode}/${testSlug}`)

        expect(
          JSON.parse(await browser.elementByCss('#props').text()).params
        ).toEqual({
          slug: decodeURIComponent(testSlug),
        })

        const browserRouter = JSON.parse(
          await browser.elementByCss('#router').text()
        )

        expect(browserRouter.pathname).toBe(`/${mode}/[slug]`)
        expect(browserRouter.asPath).toBe(`/${mode}/${testSlug}`)
        expect(browserRouter.query).toEqual({
          slug: decodeURIComponent(testSlug),
        })
      }
    }
  })

  it('should navigate client-side correctly with interpolating', async () => {
    for (const mode of modePaths) {
      const testSlug = urlPaths[0]
      const browser = await webdriver(appPort, `/${mode}/${testSlug}`)

      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: decodeURIComponent(testSlug),
      })

      const browserRouter = JSON.parse(
        await browser.elementByCss('#router').text()
      )

      expect(browserRouter.pathname).toBe(`/${mode}/[slug]`)
      expect(browserRouter.asPath).toBe(`/${mode}/${testSlug}`)
      expect(browserRouter.query).toEqual({
        slug: decodeURIComponent(testSlug),
      })

      await browser.eval('window.beforeNav = 1')

      for (const nextSlug of urlPaths) {
        if (nextSlug === testSlug) continue

        await browser.eval(`(function() {
          window.next.router.push({
            pathname: '/${mode}/[slug]',
            query: { slug: '${decodeURIComponent(nextSlug)}' }
          })
        })()`)

        await check(async () => {
          const browserRouter = JSON.parse(
            await browser.elementByCss('#router').text()
          )
          return browserRouter.asPath === `/${mode}/${nextSlug}`
            ? 'success'
            : 'fail'
        }, 'success')

        expect(await browser.eval('window.beforeNav')).toBe(1)
      }
    }
  })

  it('should navigate client-side correctly with string href', async () => {
    for (const mode of modePaths) {
      const testSlug = urlPaths[0]
      const browser = await webdriver(appPort, `/${mode}/${testSlug}`)

      expect(
        JSON.parse(await browser.elementByCss('#props').text()).params
      ).toEqual({
        slug: decodeURIComponent(testSlug),
      })

      const browserRouter = JSON.parse(
        await browser.elementByCss('#router').text()
      )

      expect(browserRouter.pathname).toBe(`/${mode}/[slug]`)
      expect(browserRouter.asPath).toBe(`/${mode}/${testSlug}`)
      expect(browserRouter.query).toEqual({
        slug: decodeURIComponent(testSlug),
      })

      await browser.eval('window.beforeNav = 1')

      for (const nextSlug of urlPaths) {
        if (nextSlug === testSlug) continue

        await browser.eval(`(function() {
          window.next.router.push('/${mode}/${nextSlug}')
        })()`)

        await check(async () => {
          const browserRouter = JSON.parse(
            await browser.elementByCss('#router').text()
          )
          return browserRouter.asPath === `/${mode}/${nextSlug}`
            ? 'success'
            : 'fail'
        }, 'success')

        expect(await browser.eval('window.beforeNav')).toBe(1)
      }
    }
  })
}

describe('Fallback path encoding', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
      buildId = 'development'
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      appPort = await findPort()
      await nextBuild(appDir)

      app = await nextStart(appDir, appPort)
      buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
