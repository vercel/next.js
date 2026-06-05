/* eslint-disable jest/no-standalone-expect */
/* eslint-disable jest/no-identical-title */
import cheerio from 'cheerio'
import {
  isNextDev,
  isNextStart,
  nextTestSetup,
  type Playwright,
} from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

// https://github.com/vercel/next.js/issues/12343
describe('Basic CSS Modules Ordering', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'useLightningcss(true)',
    () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures', 'next-issue-12343'),
        nextConfig: {
          experimental: {
            useLightningcss: true,
          },
        },
        skipDeployment: true,
      })

      async function checkGreenButton(browser: Playwright) {
        await browser.elementByCss('#link-other')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#link-other')
          return el ? window.getComputedStyle(el).backgroundColor : ''
        })
        expect(titleColor).toBe('rgb(0, 255, 0)')
      }

      async function checkPinkButton(browser: Playwright) {
        await browser.elementByCss('#link-index')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#link-index')
          return el ? window.getComputedStyle(el).backgroundColor : ''
        })
        expect(titleColor).toBe('rgb(255, 105, 180)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await next.browser('/')
        try {
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await next.browser('/')
        try {
          await checkGreenButton(browser)
          await browser.elementByCss('#link-other').moveTo()
          await retry(async () => {
            await checkGreenButton(browser)
          })
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav)', async () => {
        const browser = await next.browser('/')
        try {
          await checkGreenButton(browser)
          await browser.elementByCss('#link-other').click()

          await browser.elementByCss('#link-index')
          await checkPinkButton(browser)

          await browser.elementByCss('#link-index').click()
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })
    }
  )
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'useLightningcss(false)',
    () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures', 'next-issue-12343'),
        nextConfig: {
          experimental: {
            useLightningcss: false,
          },
        },
        skipDeployment: true,
      })

      async function checkGreenButton(browser: Playwright) {
        await browser.elementByCss('#link-other')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#link-other')
          return el ? window.getComputedStyle(el).backgroundColor : ''
        })
        expect(titleColor).toBe('rgb(0, 255, 0)')
      }

      async function checkPinkButton(browser: Playwright) {
        await browser.elementByCss('#link-index')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#link-index')
          return el ? window.getComputedStyle(el).backgroundColor : ''
        })
        expect(titleColor).toBe('rgb(255, 105, 180)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await next.browser('/')
        try {
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await next.browser('/')
        try {
          await checkGreenButton(browser)
          await browser.elementByCss('#link-other').moveTo()
          await retry(async () => {
            await checkGreenButton(browser)
          })
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav)', async () => {
        const browser = await next.browser('/')
        try {
          await checkGreenButton(browser)
          await browser.elementByCss('#link-other').click()

          await browser.elementByCss('#link-index')
          await checkPinkButton(browser)

          await browser.elementByCss('#link-index').click()
          await checkGreenButton(browser)
        } finally {
          await browser.close()
        }
      })
    }
  )
})

describe('Ordering with Global CSS and Modules', () => {
  describe('useLightningcss(true)', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'global-and-module-ordering'),
      nextConfig: {
        experimental: {
          useLightningcss: true,
        },
      },
      skipDeployment: true,
    })

    ;(isNextDev ? it : it.skip)(
      'should not execute scripts in any order',
      async () => {
        const content = await next.render('/')
        const $ = cheerio.load(content)

        let asyncCount = 0
        let totalCount = 0
        for (const script of $('script').toArray()) {
          ++totalCount
          if ('async' in script.attribs) {
            ++asyncCount
          }
        }

        expect(asyncCount).toBe(0)
        expect(totalCount).not.toBe(0)
      }
    )

    it('should have the correct color (css ordering)', async () => {
      const browser = await next.browser('/')

      const currentColor = await browser.eval(() => {
        const el = document.querySelector('#blueText')
        return el ? window.getComputedStyle(el).color : ''
      })
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
      await browser.close()
    })
    ;(isNextDev ? it : it.skip)(
      'should have the correct color (css ordering) during hot reloads',
      async () => {
        const browser = await next.browser('/')

        try {
          const blueColor = await browser.eval(() => {
            const el = document.querySelector('#blueText')
            return el ? window.getComputedStyle(el).color : ''
          })
          expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

          const yellowColor = await browser.eval(() => {
            const el = document.querySelector('#yellowText')
            return el ? window.getComputedStyle(el).color : ''
          })
          expect(yellowColor).toMatchInlineSnapshot(`"rgb(255, 255, 0)"`)

          await next.patchFile(
            'pages/index.module.css',
            (c) => (c ?? '').replace('color: yellow;', 'color: rgb(1, 1, 1);'),
            async () => {
              await retry(async () => {
                const c = await browser.eval(() => {
                  const el = document.querySelector('#yellowText')
                  return el ? window.getComputedStyle(el).color : ''
                })
                expect(c).toBe('rgb(1, 1, 1)')
              })
              await retry(async () => {
                const c = await browser.eval(() => {
                  const el = document.querySelector('#blueText')
                  return el ? window.getComputedStyle(el).color : ''
                })
                expect(c).toBe('rgb(0, 0, 255)')
              })
            }
          )
        } finally {
          await browser.close()
        }
      }
    )
    ;(isNextStart ? it : it.skip)('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })
  })

  describe('useLightningcss(false)', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'fixtures', 'global-and-module-ordering'),
      nextConfig: {
        experimental: {
          useLightningcss: false,
        },
      },
      skipDeployment: true,
    })

    ;(isNextDev ? it : it.skip)(
      'should not execute scripts in any order',
      async () => {
        const content = await next.render('/')
        const $ = cheerio.load(content)

        let asyncCount = 0
        let totalCount = 0
        for (const script of $('script').toArray()) {
          ++totalCount
          if ('async' in script.attribs) {
            ++asyncCount
          }
        }

        expect(asyncCount).toBe(0)
        expect(totalCount).not.toBe(0)
      }
    )

    it('should have the correct color (css ordering)', async () => {
      const browser = await next.browser('/')

      const currentColor = await browser.eval(() => {
        const el = document.querySelector('#blueText')
        return el ? window.getComputedStyle(el).color : ''
      })
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
      await browser.close()
    })
    ;(isNextDev ? it : it.skip)(
      'should have the correct color (css ordering) during hot reloads',
      async () => {
        const browser = await next.browser('/')

        try {
          const blueColor = await browser.eval(() => {
            const el = document.querySelector('#blueText')
            return el ? window.getComputedStyle(el).color : ''
          })
          expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

          const yellowColor = await browser.eval(() => {
            const el = document.querySelector('#yellowText')
            return el ? window.getComputedStyle(el).color : ''
          })
          expect(yellowColor).toMatchInlineSnapshot(`"rgb(255, 255, 0)"`)

          await next.patchFile(
            'pages/index.module.css',
            (c) => (c ?? '').replace('color: yellow;', 'color: rgb(1, 1, 1);'),
            async () => {
              await retry(async () => {
                const c = await browser.eval(() => {
                  const el = document.querySelector('#yellowText')
                  return el ? window.getComputedStyle(el).color : ''
                })
                expect(c).toBe('rgb(1, 1, 1)')
              })
              await retry(async () => {
                const c = await browser.eval(() => {
                  const el = document.querySelector('#blueText')
                  return el ? window.getComputedStyle(el).color : ''
                })
                expect(c).toBe('rgb(0, 0, 255)')
              })
            }
          )
        } finally {
          await browser.close()
        }
      }
    )
    ;(isNextStart ? it : it.skip)('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })
  })
})

// https://github.com/vercel/next.js/issues/12445
// This feature is not supported in Turbopack
describe('CSS Modules Composes Ordering', () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'useLightningcss(true)',
    () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures', 'composes-ordering'),
        nextConfig: {
          experimental: {
            useLightningcss: true,
          },
        },
        skipDeployment: true,
      })

      async function checkBlackTitle(browser: Playwright) {
        await browser.elementByCss('#black-title')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#black-title')
          return el ? window.getComputedStyle(el).color : ''
        })
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }

      async function checkRedTitle(browser: Playwright) {
        await browser.elementByCss('#red-title')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#red-title')
          return el ? window.getComputedStyle(el).color : ''
        })
        expect(titleColor).toBe('rgb(255, 0, 0)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await next.browser('/')
        try {
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await next.browser('/')
        try {
          await checkBlackTitle(browser)
          await browser.elementByCss('#link-other').moveTo()
          await retry(async () => {
            await checkBlackTitle(browser)
          })
        } finally {
          await browser.close()
        }
      })
      ;(isNextStart ? it : it.skip)(
        'should not change color on hover',
        async () => {
          const browser = await next.browser('/')
          try {
            await checkBlackTitle(browser)
            await browser.elementByCss('#link-other').moveTo()
            await retry(async () => {
              await checkBlackTitle(browser)
            })
          } finally {
            await browser.close()
          }
        }
      )
      ;(isNextStart ? it : it.skip)(
        'should have correct CSS injection order',
        async () => {
          const browser = await next.browser('/')
          try {
            await checkBlackTitle(browser)

            const prevSiblingHref = await browser.eval(() => {
              const el = document.querySelector(
                'link[rel=stylesheet][data-n-p]'
              )?.previousSibling as Element | null
              return el?.getAttribute('href') ?? null
            })
            const currentPageHref = await browser.eval(() => {
              return document
                .querySelector('link[rel=stylesheet][data-n-p]')
                ?.getAttribute('href')
            })
            expect(prevSiblingHref).toBeDefined()
            expect(prevSiblingHref).toBe(currentPageHref)

            await browser.elementByCss('#link-other').click()
            await checkRedTitle(browser)

            const newPrevSibling = await browser.eval(() => {
              const el = document.querySelector('style[data-n-href]')
                ?.previousSibling as Element | null
              return el?.getAttribute('data-n-css') ?? null
            })
            const newPageHref = await browser.eval(() => {
              return document
                .querySelector('style[data-n-href]')
                ?.getAttribute('data-n-href')
            })
            expect(newPrevSibling).toBe('')
            expect(newPageHref).toBeDefined()
            expect(newPageHref).not.toBe(currentPageHref)

            await browser.elementByCss('#link-index').click()
            await checkBlackTitle(browser)

            const newPrevSibling2 = await browser.eval(() => {
              const el = document.querySelector('style[data-n-href]')
                ?.previousSibling as Element | null
              return el?.getAttribute('data-n-css') ?? null
            })
            const newPageHref2 = await browser.eval(() => {
              return document
                .querySelector('style[data-n-href]')
                ?.getAttribute('data-n-href')
            })
            expect(newPrevSibling2).toBe('')
            expect(newPageHref2).toBeDefined()
            expect(newPageHref2).toBe(currentPageHref)
          } finally {
            await browser.close()
          }
        }
      )

      it('should have correct color on index page (on nav from index)', async () => {
        const browser = await next.browser('/')
        try {
          await checkBlackTitle(browser)
          await browser.elementByCss('#link-other').click()

          await browser.elementByCss('#link-index')
          await checkRedTitle(browser)

          await browser.elementByCss('#link-index').click()
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav from other)', async () => {
        const browser = await next.browser('/other')
        try {
          await checkRedTitle(browser)
          await browser.elementByCss('#link-index').click()

          await browser.elementByCss('#link-other')
          await checkBlackTitle(browser)

          await browser.elementByCss('#link-other').click()
          await checkRedTitle(browser)
        } finally {
          await browser.close()
        }
      })
    }
  )
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'useLightningcss(false)',
    () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'fixtures', 'composes-ordering'),
        nextConfig: {
          experimental: {
            useLightningcss: false,
          },
        },
        skipDeployment: true,
      })

      async function checkBlackTitle(browser: Playwright) {
        await browser.elementByCss('#black-title')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#black-title')
          return el ? window.getComputedStyle(el).color : ''
        })
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }

      async function checkRedTitle(browser: Playwright) {
        await browser.elementByCss('#red-title')
        const titleColor = await browser.eval(() => {
          const el = document.querySelector('#red-title')
          return el ? window.getComputedStyle(el).color : ''
        })
        expect(titleColor).toBe('rgb(255, 0, 0)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await next.browser('/')
        try {
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await next.browser('/')
        try {
          await checkBlackTitle(browser)
          await browser.elementByCss('#link-other').moveTo()
          await retry(async () => {
            await checkBlackTitle(browser)
          })
        } finally {
          await browser.close()
        }
      })
      ;(isNextStart ? it : it.skip)(
        'should not change color on hover',
        async () => {
          const browser = await next.browser('/')
          try {
            await checkBlackTitle(browser)
            await browser.elementByCss('#link-other').moveTo()
            await retry(async () => {
              await checkBlackTitle(browser)
            })
          } finally {
            await browser.close()
          }
        }
      )
      ;(isNextStart ? it : it.skip)(
        'should have correct CSS injection order',
        async () => {
          const browser = await next.browser('/')
          try {
            await checkBlackTitle(browser)

            const prevSiblingHref = await browser.eval(() => {
              const el = document.querySelector(
                'link[rel=stylesheet][data-n-p]'
              )?.previousSibling as Element | null
              return el?.getAttribute('href') ?? null
            })
            const currentPageHref = await browser.eval(() => {
              return document
                .querySelector('link[rel=stylesheet][data-n-p]')
                ?.getAttribute('href')
            })
            expect(prevSiblingHref).toBeDefined()
            expect(prevSiblingHref).toBe(currentPageHref)

            await browser.elementByCss('#link-other').click()
            await checkRedTitle(browser)

            const newPrevSibling = await browser.eval(() => {
              const el = document.querySelector('style[data-n-href]')
                ?.previousSibling as Element | null
              return el?.getAttribute('data-n-css') ?? null
            })
            const newPageHref = await browser.eval(() => {
              return document
                .querySelector('style[data-n-href]')
                ?.getAttribute('data-n-href')
            })
            expect(newPrevSibling).toBe('')
            expect(newPageHref).toBeDefined()
            expect(newPageHref).not.toBe(currentPageHref)

            await browser.elementByCss('#link-index').click()
            await checkBlackTitle(browser)

            const newPrevSibling2 = await browser.eval(() => {
              const el = document.querySelector('style[data-n-href]')
                ?.previousSibling as Element | null
              return el?.getAttribute('data-n-css') ?? null
            })
            const newPageHref2 = await browser.eval(() => {
              return document
                .querySelector('style[data-n-href]')
                ?.getAttribute('data-n-href')
            })
            expect(newPrevSibling2).toBe('')
            expect(newPageHref2).toBeDefined()
            expect(newPageHref2).toBe(currentPageHref)
          } finally {
            await browser.close()
          }
        }
      )

      it('should have correct color on index page (on nav from index)', async () => {
        const browser = await next.browser('/')
        try {
          await checkBlackTitle(browser)
          await browser.elementByCss('#link-other').click()

          await browser.elementByCss('#link-index')
          await checkRedTitle(browser)

          await browser.elementByCss('#link-index').click()
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav from other)', async () => {
        const browser = await next.browser('/other')
        try {
          await checkRedTitle(browser)
          await browser.elementByCss('#link-index').click()

          await browser.elementByCss('#link-other')
          await checkBlackTitle(browser)

          await browser.elementByCss('#link-other').click()
          await checkRedTitle(browser)
        } finally {
          await browser.close()
        }
      })
    }
  )
})
