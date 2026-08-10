import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import { join } from 'path'

describe('Fallback path encoding', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
    // Assertions don't apply to deploy mode (output differs vs. local Next.js server).
    skipDeployment: true,
  })

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

  const modePaths = ['fallback-blocking', 'fallback-false', 'fallback-true']

  if (isNextStart) {
    it('should output paths correctly', async () => {
      const pagesDir = join(next.testDir, '.next/server/pages')
      for (const path of prerenderedPaths) {
        for (const mode of modePaths) {
          expect(fs.existsSync(join(pagesDir, mode, path + '.html'))).toBe(true)
          expect(fs.existsSync(join(pagesDir, mode, path + '.json'))).toBe(true)
        }
      }
    })
  }

  if (isNextStart) {
    it('should handle non-prerendered paths correctly', async () => {
      const newUrlPaths = [
        '%2Fanother-post%2F',
        '%2Banother-post%2B',
        '%3Fanother-post%3F',
        '%26another-post%26',
        encodeURIComponent('商業日語商業日語'),
      ]

      const newPrerenderedPaths = [
        '%2Fanother-post%2F',
        '+another-post+',
        '%3Fanother-post%3F',
        '&another-post&',
        '商業日語商業日語',
      ]

      for (const mode of modePaths) {
        for (let i = 0; i < newUrlPaths.length; i++) {
          const testSlug = newUrlPaths[i]

          const res = await next.fetch(
            `/_next/data/${next.buildId}/${mode}/${testSlug}.json`
          )

          if (mode === 'fallback-false') {
            expect(res.status).toBe(404)
          } else {
            expect(res.status).toBe(200)

            const { pageProps: props } = await res.json()

            expect(props.params).toEqual({
              slug: decodeURIComponent(testSlug),
            })

            const pagesDir = join(next.testDir, '.next/server/pages')
            const prerenderedPath = newPrerenderedPaths[i]
            await retry(async () => {
              expect(
                fs.existsSync(join(pagesDir, mode, prerenderedPath + '.html'))
              ).toBe(true)
            })
            await retry(async () => {
              expect(
                fs.existsSync(join(pagesDir, mode, prerenderedPath + '.json'))
              ).toBe(true)
            })

            const browser = await next.browser(`/${mode}/${testSlug}`)

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
        const res = await next.fetch(`/${mode}/${testSlug}`, {
          redirect: 'manual',
        })

        expect(res.status).toBe(200)

        const $ = await next.render$(`/${mode}/${testSlug}`)

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
    const buildId = isNextDev ? 'development' : next.buildId

    for (const path of urlPaths) {
      for (const mode of modePaths) {
        const res = await next.fetch(
          `/_next/data/${buildId}/${mode}/${path}.json`,
          { redirect: 'manual' }
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
        const browser = await next.browser(`/${mode}/${testSlug}`)

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
      const browser = await next.browser(`/${mode}/${testSlug}`)

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

        await retry(async () => {
          const routerData = JSON.parse(
            await browser.elementByCss('#router').text()
          )
          expect(routerData.asPath).toBe(`/${mode}/${nextSlug}`)
        })

        expect(await browser.eval('window.beforeNav')).toBe(1)
      }
    }
  })

  it('should navigate client-side correctly with string href', async () => {
    for (const mode of modePaths) {
      const testSlug = urlPaths[0]
      const browser = await next.browser(`/${mode}/${testSlug}`)

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

        await retry(async () => {
          const routerData = JSON.parse(
            await browser.elementByCss('#router').text()
          )
          expect(routerData.asPath).toBe(`/${mode}/${nextSlug}`)
        })

        expect(await browser.eval('window.beforeNav')).toBe(1)
      }
    }
  })
})
