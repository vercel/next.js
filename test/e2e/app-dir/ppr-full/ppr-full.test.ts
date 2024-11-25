import { nextTestSetup, isNextStart } from 'e2e-utils'
import { measurePPRTimings } from 'e2e-utils/ppr'
import { links } from './components/links'
import cheerio from 'cheerio'
import { retry } from 'next-test-utils'

type Page = {
  pathname: string
  dynamic: boolean | 'force-dynamic' | 'force-static'
  revalidate?: number

  /**
   * If true, this indicates that the test case should not expect any content
   * to be sent as the static part.
   */
  emptyStaticPart?: boolean

  fallback?: boolean
}

const pages: Page[] = [
  { pathname: '/', dynamic: true },
  { pathname: '/nested/a', dynamic: true, revalidate: 60 },
  { pathname: '/nested/b', dynamic: true, revalidate: 60 },
  { pathname: '/nested/c', dynamic: true, revalidate: 60 },
  { pathname: '/metadata', dynamic: true, revalidate: 60 },
  { pathname: '/on-demand/a', dynamic: true },
  { pathname: '/on-demand/b', dynamic: true },
  { pathname: '/on-demand/c', dynamic: true },
  { pathname: '/loading/a', dynamic: true, revalidate: 60 },
  { pathname: '/loading/b', dynamic: true, revalidate: 60 },
  { pathname: '/loading/c', dynamic: true, revalidate: 60 },
  { pathname: '/static', dynamic: false },
  { pathname: '/no-suspense', dynamic: true, emptyStaticPart: true },
  { pathname: '/no-suspense/nested/a', dynamic: true, emptyStaticPart: true },
  { pathname: '/no-suspense/nested/b', dynamic: true, emptyStaticPart: true },
  { pathname: '/no-suspense/nested/c', dynamic: true, emptyStaticPart: true },
  { pathname: '/dynamic/force-dynamic', dynamic: 'force-dynamic' },
  { pathname: '/dynamic/force-dynamic/nested/a', dynamic: 'force-dynamic' },
  { pathname: '/dynamic/force-dynamic/nested/b', dynamic: 'force-dynamic' },
  { pathname: '/dynamic/force-dynamic/nested/c', dynamic: 'force-dynamic' },
  {
    pathname: '/dynamic/force-static',
    dynamic: 'force-static',
    revalidate: 60,
  },
]

describe('ppr-full', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  describe('Test Setup', () => {
    it('has all the test pathnames listed in the links component', () => {
      for (const { pathname } of pages) {
        expect(links).toContainEqual(
          expect.objectContaining({ href: pathname })
        )
      }
    })
  })

  describe('Metadata', () => {
    it('should set the right metadata when generateMetadata uses dynamic APIs', async () => {
      const browser = await next.browser('/metadata')

      try {
        const title = await browser.elementByCss('title').text()
        expect(title).toEqual('Metadata')
      } finally {
        await browser.close()
      }
    })
  })

  describe('HTML Response', () => {
    describe.each(pages)(
      'for $pathname',
      ({ pathname, dynamic, revalidate, emptyStaticPart }) => {
        beforeAll(async () => {
          // Hit the page once to populate the cache.
          const res = await next.fetch(pathname)

          // Consume the response body to ensure the cache is populated.
          await res.text()
        })

        it('should allow navigations to and from a pages/ page', async () => {
          const browser = await next.browser(pathname)

          try {
            await browser.waitForElementByCss(`[data-pathname="${pathname}"]`)

            // Add a window var so we can detect if there was a full navigation.
            const now = Date.now()
            await browser.eval(`window.beforeNav = ${now.toString()}`)

            // Navigate to the pages page and wait for the page to load.
            await browser.elementByCss(`a[href="/pages"]`).click()
            await browser.waitForElementByCss('[data-pathname="/pages"]')

            // Ensure we did a full page navigation, and not a client navigation.
            let beforeNav = await browser.eval('window.beforeNav')
            expect(beforeNav).not.toBe(now)

            await browser.eval(`window.beforeNav = ${now.toString()}`)

            // Navigate back and wait for the page to load.
            await browser.elementByCss(`a[href="${pathname}"]`).click()
            await browser.waitForElementByCss(`[data-pathname="${pathname}"]`)

            // Ensure we did a full page navigation, and not a client navigation.
            beforeNav = await browser.eval('window.beforeNav')
            expect(beforeNav).not.toBe(now)
          } finally {
            await browser.close()
          }
        })

        it('should have correct headers', async () => {
          const res = await next.fetch(pathname)
          expect(res.status).toEqual(200)
          expect(res.headers.get('content-type')).toEqual(
            'text/html; charset=utf-8'
          )

          const cacheControl = res.headers.get('cache-control')
          if (isNextDeploy) {
            expect(cacheControl).toEqual('public, max-age=0, must-revalidate')
          } else if (isNextDev) {
            expect(cacheControl).toEqual('no-store, must-revalidate')
          } else if (dynamic === false || dynamic === 'force-static') {
            expect(cacheControl).toEqual(
              `s-maxage=${revalidate || '31536000'}, stale-while-revalidate`
            )
          } else {
            expect(cacheControl).toEqual(
              'private, no-cache, no-store, max-age=0, must-revalidate'
            )
          }

          // The cache header is not relevant in development and is not
          // deterministic enough for this table test to verify.
          if (isNextDev) return

          if (
            !isNextDeploy &&
            (dynamic === false || dynamic === 'force-static')
          ) {
            expect(res.headers.get('x-nextjs-cache')).toEqual('HIT')
          } else {
            expect(res.headers.get('x-nextjs-cache')).toEqual(null)
          }
        })

        if (dynamic === true && !isNextDev) {
          it('should cache the static part', async () => {
            const delay = 500

            const dynamicValue = `${Date.now()}:${Math.random()}`

            const {
              timings: { streamFirstChunk, streamEnd, start },
              chunks,
            } = await measurePPRTimings(async () => {
              const res = await next.fetch(pathname, {
                headers: {
                  'X-Delay': delay.toString(),
                  'X-Test-Input': dynamicValue,
                },
              })
              expect(res.status).toBe(200)

              return res.body
            }, delay)
            if (emptyStaticPart) {
              expect(streamFirstChunk - start).toBeGreaterThanOrEqual(delay)
            } else {
              expect(streamFirstChunk - start).toBeLessThan(delay)
            }
            expect(streamEnd - start).toBeGreaterThanOrEqual(delay)

            // The static part should not contain the dynamic input.
            expect(chunks.dynamic).toContain(dynamicValue)

            // Ensure static part contains what we expect.
            if (emptyStaticPart) {
              expect(chunks.static).toBe('')
            } else {
              expect(chunks.static).toContain('Dynamic Loading...')
              expect(chunks.static).not.toContain(dynamicValue)
            }
          })
        }

        if (dynamic === true || dynamic === 'force-dynamic') {
          it('should resume with dynamic content', async () => {
            const expected = `${Date.now()}:${Math.random()}`
            const res = await next.fetch(pathname, {
              headers: { 'X-Test-Input': expected },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual(
              'text/html; charset=utf-8'
            )
            const html = await res.text()
            expect(html).toContain(expected)
            expect(html).not.toContain('MISSING:USER-AGENT')
            expect(html).toContain('</html>')
          })
        } else {
          it('should not contain dynamic content', async () => {
            const unexpected = `${Date.now()}:${Math.random()}`
            const res = await next.fetch(pathname, {
              headers: { 'X-Test-Input': unexpected },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual(
              'text/html; charset=utf-8'
            )
            const html = await res.text()
            expect(html).not.toContain(unexpected)
            if (dynamic !== false) {
              expect(html).toContain('MISSING:USER-AGENT')
              expect(html).toContain('MISSING:X-TEST-INPUT')
            }
            expect(html).toContain('</html>')
          })
        }
      }
    )
  })

  if (!isNextDev) {
    describe('HTML Fallback', () => {
      // We'll attempt to load N pages, all of which will not exist in the cache.
      const pathnames: Array<{
        pathname: string
        slug: string
        client: boolean
      }> = []
      const patterns: Array<
        [generator: (slug: string) => string, client: boolean, nested: boolean]
      > = [
        [(slug) => `/fallback/params/${slug}`, false, false],
        [(slug) => `/fallback/use-pathname/${slug}`, true, false],
        [(slug) => `/fallback/use-params/${slug}`, true, false],
        [
          (slug) => `/fallback/use-selected-layout-segment/${slug}`,
          true,
          false,
        ],
        [
          (slug) => `/fallback/use-selected-layout-segments/${slug}`,
          true,
          false,
        ],
        [(slug) => `/fallback/nested/params/${slug}`, false, true],
        [(slug) => `/fallback/nested/use-pathname/${slug}`, true, true],
        [(slug) => `/fallback/nested/use-params/${slug}`, true, true],
        [
          (slug) => `/fallback/nested/use-selected-layout-segment/${slug}`,
          true,
          true,
        ],
        [
          (slug) => `/fallback/nested/use-selected-layout-segments/${slug}`,
          true,
          true,
        ],
      ]
      const pad = (num: number) => String(num).padStart(2, '0')
      for (let i = 1; i < 2; i++) {
        for (const [pattern, client, nested] of patterns) {
          let slug: string
          if (nested) {
            const slugs: string[] = []
            for (let j = i + 1; j < i + 2; j++) {
              slugs.push(`slug-${pad(i)}/slug-${pad(j)}`)
            }
            slug = slugs.join('/')
          } else {
            slug = `slug-${pad(i)}`
          }

          pathnames.push({ pathname: pattern(slug), slug, client })
        }
      }

      describe.each(pathnames)(
        'for $pathname',
        ({ pathname, slug, client }) => {
          it('should render the fallback HTML immediately', async () => {
            const delay = 1000

            const {
              timings: { streamFirstChunk, start, streamEnd },
              chunks,
            } = await measurePPRTimings(async () => {
              const res = await next.fetch(pathname)
              expect(res.status).toBe(200)

              return res.body
            }, delay)

            // Expect that the first chunk should be emitted before the delay is
            // complete, implying that the fallback shell was sent immediately.
            expect(streamFirstChunk - start).toBeLessThan(delay)

            // Expect that the last chunk should be emitted after the delay is
            // complete.
            expect(streamEnd - start).toBeGreaterThanOrEqual(delay)

            if (client) {
              const browser = await next.browser(pathname)
              try {
                await browser.waitForElementByCss('[data-slug]')
                expect(
                  await browser.elementByCss('[data-slug]').text()
                ).toContain(slug)
              } finally {
                await browser.close()
              }
            } else {
              // The static part should not contain the dynamic parameter.
              let $ = cheerio.load(chunks.static)
              let data = $('[data-slug]').text()
              expect(data).not.toContain(slug)
              expect($('[data-slug]').closest('[hidden]').length).toBe(0)

              // The dynamic part should contain the dynamic parameter.
              $ = cheerio.load(chunks.dynamic)
              data = $('[data-slug]').text()
              expect(data).toContain(slug)
              expect($('[data-slug]').closest('[hidden]').length).toBe(1)

              // The static part should contain the fallback shell.
              expect(chunks.static).toContain('data-fallback')
            }
          })
        }
      )

      describe('Dynamic Shell', () => {
        it('should render the fallback shell on first visit', async () => {
          const random = Math.random().toString(16).slice(2)
          const pathname = `/fallback/dynamic/params/on-first-visit-${random}`
          const $ = await next.render$(pathname)
          expect($('[data-slug]').closest('[hidden]').length).toBe(1)
          expect($('[data-agent]').closest('[hidden]').length).toBe(1)
        })

        if (isNextDeploy) {
          it('should render the fallback shell every time', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/dynamic/params/on-second-visit-${random}`

            let $ = await next.render$(pathname)
            expect($('[data-slug]').closest('[hidden]').length).toBe(1)
            expect($('[data-agent]').closest('[hidden]').length).toBe(1)

            for (let i = 0; i < 10; i++) {
              $ = await next.render$(pathname)
              expect($('[data-slug]').closest('[hidden]').length).toBe(1)
              expect($('[data-agent]').closest('[hidden]').length).toBe(1)
            }
          })

          it('should render the fallback shell even if the page is static', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/params/on-second-visit-${random}`

            // Expect that the slug had to be resumed.
            let $ = await next.render$(pathname)
            expect($('[data-slug]').closest('[hidden]').length).toBe(1)

            for (let i = 0; i < 10; i++) {
              $ = await next.render$(pathname)
              expect($('[data-slug]').closest('[hidden]').length).toBe(1)
            }
          })

          it('will not revalidate the fallback shell', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/dynamic/params/revalidate-${random}`

            let $ = await next.render$(pathname)
            const fallbackID = $('[data-layout]').data('layout') as string

            // Now let's revalidate the page.
            await next.fetch(
              `/api/revalidate?pathname=${encodeURIComponent(pathname)}`
            )

            // We expect to get the fallback shell again.
            $ = await next.render$(pathname)
            expect($('[data-layout]').data('layout')).toBe(fallbackID)

            // Let's wait for the page to be revalidated.
            await retry(async () => {
              $ = await next.render$(pathname)
              const newDynamicID = $('[data-layout]').data('layout') as string
              expect(newDynamicID).toBe(fallbackID)
            })
          })
        } else {
          it('should render the route shell on the second visit', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/dynamic/params/on-second-visit-${random}`

            let $ = await next.render$(pathname)
            expect($('[data-slug]').closest('[hidden]').length).toBe(1)
            expect($('[data-agent]').closest('[hidden]').length).toBe(1)

            await retry(async () => {
              $ = await next.render$(pathname)
              expect($('[data-slug]').closest('[hidden]').length).toBe(0)
              expect($('[data-agent]').closest('[hidden]').length).toBe(1)
            })
          })

          it('should render the dynamic shell as static if the page is static', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/params/on-second-visit-${random}`

            // Expect that the slug had to be resumed.
            let $ = await next.render$(pathname)
            expect($('[data-slug]').closest('[hidden]').length).toBe(1)

            // The slug didn't have to be resumed, and it should all be static.
            await retry(async () => {
              $ = await next.render$(pathname)
              expect($('[data-slug]').closest('[hidden]').length).toBe(0)

              const {
                timings: { streamFirstChunk, start, streamEnd },
                chunks,
              } = await measurePPRTimings(async () => {
                const res = await next.fetch(pathname)
                expect(res.status).toBe(200)
                expect(res.headers.get('x-nextjs-cache')).toBe('HIT')

                return res.body
              }, 1000)

              expect(chunks.dynamic).toBe('')
              expect(streamFirstChunk - start).toBeLessThan(500)
              expect(streamEnd - start).toBeLessThan(500)
            })
          })

          it('will only revalidate the page', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/dynamic/params/revalidate-${random}`

            let $ = await next.render$(pathname)
            const fallbackID = $('[data-layout]').data('layout') as string

            let dynamicID: string
            await retry(async () => {
              $ = await next.render$(pathname)
              dynamicID = $('[data-layout]').data('layout') as string

              // These should be different,
              expect(dynamicID).not.toBe(fallbackID)
            })

            // Now let's revalidate the page.
            await next.fetch(
              `/api/revalidate?pathname=${encodeURIComponent(pathname)}`
            )

            // We expect to get the fallback shell again.
            $ = await next.render$(pathname)
            expect($('[data-layout]').data('layout')).toBe(fallbackID)

            // Let's wait for the page to be revalidated.
            await retry(async () => {
              $ = await next.render$(pathname)
              const newDynamicID = $('[data-layout]').data('layout') as string
              expect(newDynamicID).not.toBe(dynamicID)
            })
          })

          it('will revalidate the page and fallback shell', async () => {
            const random = Math.random().toString(16).slice(2)
            const pathname = `/fallback/dynamic/params/revalidate-${random}`

            let $ = await next.render$(pathname)
            const fallbackID = $('[data-layout]').data('layout') as string

            let dynamicID: string
            await retry(async () => {
              $ = await next.render$(pathname)
              dynamicID = $('[data-layout]').data('layout') as string

              // These should be different,
              expect(dynamicID).not.toBe(fallbackID)
            })

            // Now let's revalidate the page.
            await next.fetch(
              `/api/revalidate?pathname=${encodeURIComponent(pathname)}`
            )

            // We expect to get the fallback shell.
            $ = await next.render$(pathname)

            // When deployed to Vercel, it will serve a stale version of the dynamic shell
            // Whereas with `next start` it will serve the fallback shell
            expect($('[data-layout]').data('layout')).toBe(fallbackID)

            // Let's wait for the page to be revalidated.
            let revalidatedDynamicID: string
            await retry(async () => {
              $ = await next.render$(pathname)
              revalidatedDynamicID = $('[data-layout]').data('layout') as string
              expect(revalidatedDynamicID).not.toBe(dynamicID)
              expect(revalidatedDynamicID).not.toBe(fallbackID)
            })
          })
        }

        /**
         * This test is really here to just to force the the suite to have the expected route
         * as part of the build. If this failed we'd get a build error and all the tests would fail
         */
        it('will allow dynamic fallback shells even when static is enforced', async () => {
          const random = Math.random().toString(16).slice(2)
          const pathname = `/fallback/dynamic/params/revalidate-${random}`

          let $ = await next.render$(pathname)
          expect($('[data-slug]').text()).toBe(`revalidate-${random}`)
        })
      })

      it('should allow client layouts without postponing fallback if params are not accessed', async () => {
        const $ = await next.render$('/fallback/client/params/page/slug-01')

        let selector = $(
          '[data-file="app/fallback/client/params/[slug]/loading"]'
        )
        expect(selector.length).toBe(1)
        expect(selector.closest('[hidden]').length).toBe(0)

        selector = $('[data-file="app/fallback/client/params/[slug]/layout"]')
        expect(selector.length).toBe(1)
        expect(selector.closest('[hidden]').length).toBe(0)

        selector = $('[data-file="app/fallback/client/params/[slug]/page"]')
        expect(selector.length).toBe(1)
        expect(selector.closest('[hidden]').length).toBe(1)
      })

      it('should postpone in client layout when fallback params are accessed', async () => {
        const $ = await next.render$('/fallback/client/params/layout/slug-01')

        let selector = $('[data-fallback="true"]')
        expect(selector.length).toBe(1)
        expect(selector.closest('[hidden]').length).toBe(0)

        selector = $('[data-file="app/fallback/client/params/[slug]/layout"]')
        expect(selector.length).toBe(1)
        expect(selector.closest('[hidden]').length).toBe(1)

        selector = $('[data-file="app/fallback/client/params/[slug]/page"]')
        expect(selector.length).toBe(1)
        expect(selector.closest('[hidden]').length).toBe(1)
      })
    })
  }

  describe('Navigation Signals', () => {
    const delay = 500

    describe.each([
      {
        signal: 'notFound()' as const,
        pathnames: ['/navigation/not-found', '/navigation/not-found/dynamic'],
      },
      {
        signal: 'redirect()' as const,
        pathnames: ['/navigation/redirect', '/navigation/redirect/dynamic'],
      },
    ])('$signal', ({ signal, pathnames }) => {
      describe.each(pathnames)('for %s', (pathname) => {
        it('should have correct headers', async () => {
          const res = await next.fetch(pathname, {
            redirect: 'manual',
          })
          expect(res.status).toEqual(signal === 'redirect()' ? 307 : 404)
          expect(res.headers.get('content-type')).toEqual(
            'text/html; charset=utf-8'
          )

          if (isNextStart) {
            expect(res.headers.get('cache-control')).toEqual(
              's-maxage=31536000, stale-while-revalidate'
            )
          }

          if (isNextDeploy) {
            expect(res.headers.get('cache-control')).toEqual(
              'public, max-age=0, must-revalidate'
            )
          }

          if (signal === 'redirect()') {
            const location = res.headers.get('location')
            expect(location).not.toBeNull()
            expect(typeof location).toEqual('string')

            // The URL returned in `Location` is absolute, so we need to parse it
            // to get the pathname.
            const url = new URL(location)
            expect(url.pathname).toEqual('/navigation/redirect/location')
          }
        })

        if (pathname.endsWith('/dynamic')) {
          it('should cache the static part', async () => {
            const {
              timings: { streamFirstChunk, streamEnd, start },
            } = await measurePPRTimings(async () => {
              const res = await next.fetch(pathname, {
                redirect: 'manual',
                headers: {
                  'X-Delay': delay.toString(),
                },
              })

              return res.body
            }, delay)
            expect(streamFirstChunk - start).toBeLessThan(delay)

            if (isNextDev) {
              // This is because the signal should throw and interrupt the
              // delay timer.
              expect(streamEnd - start).toBeGreaterThanOrEqual(delay)
            } else {
              expect(streamEnd - start).toBeLessThan(delay)
            }
          })
        }
      })
    })
  })

  if (!isNextDev) {
    describe('Prefetch RSC Response', () => {
      describe.each(pages)('for $pathname', ({ pathname, revalidate }) => {
        it('should have correct headers', async () => {
          await retry(async () => {
            const res = await next.fetch(pathname, {
              headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
            })

            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual('text/x-component')

            if (isNextDeploy) {
              expect(res.headers.get('cache-control')).toEqual(
                'public, max-age=0, must-revalidate'
              )
            } else {
              expect(res.headers.get('cache-control')).toEqual(
                `s-maxage=${revalidate || '31536000'}, stale-while-revalidate`
              )
            }

            if (!isNextDeploy) {
              expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
            } else {
              expect(res.headers.get('x-vercel-cache')).toBe('HIT')
            }
          })
        })

        it('should not contain dynamic content', async () => {
          const unexpected = `${Date.now()}:${Math.random()}`
          const res = await next.fetch(pathname, {
            headers: {
              RSC: '1',
              'Next-Router-Prefetch': '1',
              'X-Test-Input': unexpected,
            },
          })
          expect(res.status).toEqual(200)
          expect(res.headers.get('content-type')).toEqual('text/x-component')
          const text = await res.text()
          expect(text).not.toContain(unexpected)
        })
      })
    })

    describe('Dynamic RSC Response', () => {
      describe.each(pages)('for $pathname', ({ pathname, dynamic }) => {
        it('should have correct headers', async () => {
          const res = await next.fetch(pathname, {
            headers: { RSC: '1' },
          })
          expect(res.status).toEqual(200)
          expect(res.headers.get('content-type')).toEqual('text/x-component')
          expect(res.headers.get('cache-control')).toEqual(
            'private, no-cache, no-store, max-age=0, must-revalidate'
          )
          if (isNextDeploy) {
            expect(res.headers.get('x-vercel-cache')).toBe('MISS')
          } else {
            expect(res.headers.get('x-nextjs-cache')).toEqual(null)
          }
        })

        if (dynamic === true || dynamic === 'force-dynamic') {
          it('should contain dynamic content', async () => {
            const expected = `${Date.now()}:${Math.random()}`
            const res = await next.fetch(pathname, {
              headers: { RSC: '1', 'X-Test-Input': expected },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual('text/x-component')
            const text = await res.text()
            expect(text).toContain(expected)
          })
        } else {
          it('should not contain dynamic content', async () => {
            const unexpected = `${Date.now()}:${Math.random()}`
            const res = await next.fetch(pathname, {
              headers: {
                RSC: '1',
                'X-Test-Input': unexpected,
              },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual('text/x-component')
            const text = await res.text()
            expect(text).not.toContain(unexpected)
          })
        }
      })
    })

    describe('Dynamic Data pages', () => {
      describe('Optimistic UI', () => {
        it('should initially render with optimistic UI', async () => {
          const $ = await next.render$('/dynamic-data?foo=bar')

          // We defined some server html let's make sure it flushed both in the head
          // There may be additional flushes in the body but we want to ensure that
          // server html is getting inserted in the shell correctly here
          const serverHTML = $('head meta[name="server-html"]')
          expect(serverHTML.length).toEqual(1)
          expect($(serverHTML[0]).attr('content')).toEqual('0')

          // We expect the server HTML to be the optimistic output
          expect($('#foosearch').text()).toEqual('foo search: optimistic')

          // We expect hydration to patch up the render with dynamic data
          // from the resume
          const browser = await next.browser('/dynamic-data?foo=bar')
          try {
            await browser.waitForElementByCss('#foosearch')
            expect(
              await browser.eval(
                'document.getElementById("foosearch").textContent'
              )
            ).toEqual('foo search: bar')
          } finally {
            await browser.close()
          }
        })
        it('should render entirely statically with force-static', async () => {
          const $ = await next.render$('/dynamic-data/force-static?foo=bar')

          // We defined some server html let's make sure it flushed both in the head
          // There may be additional flushes in the body but we want to ensure that
          // server html is getting inserted in the shell correctly here
          const serverHTML = $('head meta[name="server-html"]')
          expect(serverHTML.length).toEqual(1)
          expect($(serverHTML[0]).attr('content')).toEqual('0')

          // We expect the server HTML to be forced static so no params
          // were made available but also nothing threw and was caught for
          // optimistic UI
          expect($('#foosearch').text()).toEqual('foo search: ')

          // There is no hydration mismatch, we continue to have empty searchParams
          const browser = await next.browser(
            '/dynamic-data/force-static?foo=bar'
          )
          try {
            await browser.waitForElementByCss('#foosearch')
            expect(
              await browser.eval(
                'document.getElementById("foosearch").textContent'
              )
            ).toEqual('foo search: ')
          } finally {
            await browser.close()
          }
        })
        it('should render entirely dynamically when force-dynamic', async () => {
          const $ = await next.render$('/dynamic-data/force-dynamic?foo=bar')

          // We defined some server html let's make sure it flushed both in the head
          // There may be additional flushes in the body but we want to ensure that
          // server html is getting inserted in the shell correctly here
          const serverHTML = $('head meta[name="server-html"]')
          expect(serverHTML.length).toEqual(1)
          expect($(serverHTML[0]).attr('content')).toEqual('0')

          // We expect the server HTML to render dynamically
          expect($('#foosearch').text()).toEqual('foo search: bar')
        })
      })

      describe('Incidental postpones', () => {
        it('should initially render with optimistic UI', async () => {
          const $ = await next.render$(
            '/dynamic-data/incidental-postpone?foo=bar'
          )

          // We defined some server html let's make sure it flushed both in the head
          // There may be additional flushes in the body but we want to ensure that
          // server html is getting inserted in the shell correctly here
          const serverHTML = $('head meta[name="server-html"]')
          expect(serverHTML.length).toEqual(1)
          expect($(serverHTML[0]).attr('content')).toEqual('0')

          // We expect the server HTML to be the optimistic output
          expect($('#foosearch').text()).toEqual('foo search: optimistic')

          // We expect hydration to patch up the render with dynamic data
          // from the resume
          const browser = await next.browser(
            '/dynamic-data/incidental-postpone?foo=bar'
          )
          try {
            await browser.waitForElementByCss('#foosearch')
            expect(
              await browser.eval(
                'document.getElementById("foosearch").textContent'
              )
            ).toEqual('foo search: bar')
          } finally {
            await browser.close()
          }
        })
        it('should render entirely statically with force-static', async () => {
          const $ = await next.render$(
            '/dynamic-data/incidental-postpone/force-static?foo=bar'
          )

          // We defined some server html let's make sure it flushed both in the head
          // There may be additional flushes in the body but we want to ensure that
          // server html is getting inserted in the shell correctly here
          const serverHTML = $('head meta[name="server-html"]')
          expect(serverHTML.length).toEqual(1)
          expect($(serverHTML[0]).attr('content')).toEqual('0')

          // We expect the server HTML to be forced static so no params
          // were made available but also nothing threw and was caught for
          // optimistic UI
          expect($('#foosearch').text()).toEqual('foo search: ')

          // There is no hydration mismatch, we continue to have empty searchParams
          const browser = await next.browser(
            '/dynamic-data/incidental-postpone/force-static?foo=bar'
          )
          try {
            await browser.waitForElementByCss('#foosearch')
            expect(
              await browser.eval(
                'document.getElementById("foosearch").textContent'
              )
            ).toEqual('foo search: ')
          } finally {
            await browser.close()
          }
        })
        it('should render entirely dynamically when force-dynamic', async () => {
          const $ = await next.render$(
            '/dynamic-data/incidental-postpone/force-dynamic?foo=bar'
          )

          // We defined some server html let's make sure it flushed both in the head
          // There may be additional flushes in the body but we want to ensure that
          // server html is getting inserted in the shell correctly here
          const serverHTML = $('head meta[name="server-html"]')
          expect(serverHTML.length).toEqual(1)
          expect($(serverHTML[0]).attr('content')).toEqual('0')

          // We expect the server HTML to render dynamically
          expect($('#foosearch').text()).toEqual('foo search: bar')
        })
      })
    })
  }
})
