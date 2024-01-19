import { createNextDescribe } from 'e2e-utils'

async function measure(stream: NodeJS.ReadableStream) {
  let streamFirstChunk = 0
  let streamEnd = 0

  const data: {
    chunk: string
    emittedAt: number
  }[] = []

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => {
      if (!streamFirstChunk) {
        streamFirstChunk = Date.now()
      }

      if (typeof chunk !== 'string') {
        chunk = chunk.toString()
      }

      data.push({ chunk, emittedAt: Date.now() })
    })

    stream.on('end', () => {
      streamEnd = Date.now()
      resolve()
    })

    stream.on('error', reject)
  })

  return {
    streamFirstChunk,
    streamEnd,
    data,
  }
}

type Page = {
  pathname: string
  dynamic: boolean | 'force-dynamic' | 'force-static'
  revalidate?: number

  /**
   * If true, this indicates that the test case should not expect any content
   * to be sent as the static part.
   */
  emptyStaticPart?: boolean
}

const pages: Page[] = [
  { pathname: '/', dynamic: true },
  { pathname: '/nested/a', dynamic: true, revalidate: 60 },
  { pathname: '/nested/b', dynamic: true, revalidate: 60 },
  { pathname: '/nested/c', dynamic: true, revalidate: 60 },
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

createNextDescribe(
  'ppr-full',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextDeploy }) => {
    describe('HTML Response', () => {
      describe.each(pages)(
        'for $pathname',
        ({ pathname, dynamic, revalidate, emptyStaticPart }) => {
          beforeEach(async () => {
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

          if (dynamic === true) {
            it('should cache the static part', async () => {
              const delay = 500

              const dynamicValue = `${Date.now()}:${Math.random()}`
              const start = Date.now()
              const res = await next.fetch(pathname, {
                headers: {
                  'X-Delay': delay.toString(),
                  'X-Test-Input': dynamicValue,
                },
              })
              expect(res.status).toBe(200)

              const result = await measure(res.body)
              if (emptyStaticPart) {
                expect(result.streamFirstChunk - start).toBeGreaterThanOrEqual(
                  delay
                )
              } else {
                expect(result.streamFirstChunk - start).toBeLessThan(delay)
              }
              expect(result.streamEnd - start).toBeGreaterThanOrEqual(delay)

              // Find all the chunks that arrived before the delay, and split
              // it into the static and dynamic parts.
              const chunks = result.data.reduce(
                (acc, { chunk, emittedAt }) => {
                  if (emittedAt < start + delay) {
                    acc.static.push(chunk)
                  } else {
                    acc.dynamic.push(chunk)
                  }
                  return acc
                },
                { static: [], dynamic: [] }
              )

              const parts = {
                static: chunks.static.join(''),
                dynamic: chunks.dynamic.join(''),
              }

              // The static part should not contain the dynamic input.
              expect(parts.dynamic).toContain(dynamicValue)

              // Ensure static part contains what we expect.
              if (emptyStaticPart) {
                expect(parts.static).toBe('')
              } else {
                expect(parts.static).toContain('Dynamic Loading...')
                expect(parts.static).not.toContain(dynamicValue)
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
      describe('Prefetch RSC Response', () => {
        describe.each(pages)('for $pathname', ({ pathname, revalidate }) => {
          it('should have correct headers', async () => {
            const res = await next.fetch(pathname, {
              headers: { RSC: '1', 'Next-Router-Prefetch': '1' },
            })
            expect(res.status).toEqual(200)
            expect(res.headers.get('content-type')).toEqual('text/x-component')

            // cache header handling is different when in minimal mode
            const cache = res.headers.get('cache-control')
            if (isNextDeploy) {
              expect(cache).toEqual('public, max-age=0, must-revalidate')
            } else {
              expect(cache).toEqual(
                `s-maxage=${revalidate || '31536000'}, stale-while-revalidate`
              )
            }

            if (!isNextDeploy) {
              expect(res.headers.get('x-nextjs-cache')).toEqual('HIT')
            } else {
              expect(res.headers.get('x-nextjs-cache')).toEqual(null)
            }
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
            expect(res.headers.get('x-nextjs-cache')).toEqual(null)
          })

          if (dynamic === true || dynamic === 'force-dynamic') {
            it('should contain dynamic content', async () => {
              const expected = `${Date.now()}:${Math.random()}`
              const res = await next.fetch(pathname, {
                headers: { RSC: '1', 'X-Test-Input': expected },
              })
              expect(res.status).toEqual(200)
              expect(res.headers.get('content-type')).toEqual(
                'text/x-component'
              )
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
              expect(res.headers.get('content-type')).toEqual(
                'text/x-component'
              )
              const text = await res.text()
              expect(text).not.toContain(unexpected)
            })
          }
        })
      })
    }
  }
)
