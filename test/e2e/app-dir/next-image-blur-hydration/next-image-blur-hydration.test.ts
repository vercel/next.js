import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Page } from 'playwright'
import type {} from './components/hydration-gate'

describe('next-image-blur-hydration', () => {
  const { next, isNextDev } = nextTestSetup({ files: __dirname })

  async function transformDocument(
    page: Page,
    transform: (html: string) => string
  ) {
    // Fulfilling a document gives it a public address space in Chromium. Allow
    // the fixture's local HMR socket so development hydration can finish.
    if (global.browserName === 'chrome') {
      await page.context().grantPermissions(['local-network-access'])
    }
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      await route.fulfill({ response, body: transform(await response.text()) })
    })
  }

  async function withDelayedHydration(
    pathname: string,
    before: (page: Page) => Promise<void>,
    after: (page: Page) => Promise<void>,
    setup?: (page: Page) => Promise<void>,
    cleanup?: () => void
  ) {
    let page: Page
    let release: () => void
    const hydration = new Promise<void>((resolve) => {
      release = resolve
    })
    const hydrationErrors: string[] = []
    try {
      await next.browser(pathname, {
        waitHydration: false,
        waitUntil: 'commit',
        async beforePageLoad(p) {
          page = p
          p.on('console', (msg) => {
            if (
              msg.type() === 'error' &&
              /hydrat|didn't match/i.test(msg.text())
            ) {
              hydrationErrors.push(msg.text())
            }
          })
          p.on('pageerror', (error) => hydrationErrors.push(error.message))
          await p.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
            await hydration
            await route.continue()
          })
          await setup?.(p)
        },
      })
      await page.waitForSelector('#image', { state: 'attached' })
      await before(page)
      expect(await page.locator('#hydration').textContent()).toBe('server')
      release()
      await retry(async () => {
        expect(await page.locator('#hydration').textContent()).toBe('hydrated')
      })
      await after(page)
      expect(hydrationErrors).toEqual([])
    } finally {
      release()
      cleanup?.()
      await page?.unrouteAll({ behavior: 'wait' })
    }
  }

  async function expectReactOwnsImage(page: Page) {
    await retry(async () => {
      expect(await page.locator('#loads').textContent()).toBe('1')
      expect(
        await page.locator('#image').evaluate((img) => ({
          background: getComputedStyle(img).backgroundImage,
          effects: img.getAnimations().length,
        }))
      ).toEqual({ background: 'none', effects: 0 })
    })
  }

  async function expectImageDecoded(page: Page) {
    // Firefox can reject decode() before a replacement or lazy request has
    // started. Assert successful loading first instead of swallowing rejection.
    await retry(async () => {
      expect(
        await page
          .locator('#image')
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0
          )
      ).toBe(true)
    })
    await page
      .locator('#image')
      .evaluate((img: HTMLImageElement) => img.decode())
  }

  it('does not emit a bootstrap for the empty placeholder', async () => {
    const $ = await next.render$('/empty')
    expect($('#__next-image-blur').length).toBe(0)
    expect($('#image').attr('data-nimg-placeholder')).toBeUndefined()
  })

  it.each(['complete', 'unmount'])(
    'keeps the early override during hydration decode before %s',
    async (action) => {
      await withDelayedHydration(
        '/',
        async (page) => {
          await retry(async () => {
            expect(
              await page
                .locator('#image')
                .evaluate((img) => getComputedStyle(img).backgroundImage)
            ).toBe('none')
          })
          await page.evaluate(() => {
            const original = HTMLImageElement.prototype.decode
            ;(window as any).pendingHydrationDecodes = []
            ;(window as any).releaseHydrationDecodes = () => {
              HTMLImageElement.prototype.decode = original
              for (const resolve of (window as any).pendingHydrationDecodes)
                resolve()
            }
            HTMLImageElement.prototype.decode = function () {
              const decoded = original.call(this)
              return this.id === 'image'
                ? decoded.then(
                    () =>
                      new Promise<void>((resolve) => {
                        ;(window as any).pendingHydrationDecodes.push(resolve)
                      })
                  )
                : decoded
            }
          })
        },
        async (page) => {
          try {
            await retry(async () => {
              expect(await page.locator('#effect-runs').textContent()).toBe(
                isNextDev ? '2' : '1'
              )
              expect(
                await page.evaluate(
                  () => (window as any).pendingHydrationDecodes.length
                )
              ).toBe(1)
            })
            // Assert the intermediate state, not only the eventual loaded result.
            expect(await page.locator('#loads').textContent()).toBe('0')
            expect(
              await page
                .locator('#image')
                .evaluate((img) => getComputedStyle(img).backgroundImage)
            ).toBe('none')
            if (action === 'unmount') {
              await page.locator('#remove-image').click()
              await retry(async () => {
                expect(await page.locator('#image').count()).toBe(0)
                expect(
                  await page.locator('style[data-next-image-blur]').count()
                ).toBe(0)
              })
            }
            await page.evaluate(async () => {
              ;(window as any).releaseHydrationDecodes()
              await new Promise(requestAnimationFrame)
            })
            if (action === 'complete') await expectReactOwnsImage(page)
            else expect(await page.locator('#loads').textContent()).toBe('0')
            expect(
              await page.locator('style[data-next-image-blur]').count()
            ).toBe(0)
          } finally {
            await page.evaluate(() => (window as any).releaseHydrationDecodes())
          }
        }
      )
    }
  )

  it('reuses inactive CSS rules without scanning the stylesheet or replaying cleanup', async () => {
    await withDelayedHydration(
      '/',
      async (page) => {
        await retry(async () => {
          expect(
            await page
              .locator('style[data-next-image-blur]')
              .evaluate(
                (style: HTMLStyleElement) => style.sheet.cssRules.length
              )
          ).toBe(2)
        })
        const cleaned = await page.evaluate(() => {
          const img = document.getElementById('image') as any
          const sheet = document.querySelector<HTMLStyleElement>(
            'style[data-next-image-blur]'
          ).sheet
          const rule = Array.from(sheet.cssRules).find(
            (candidate: CSSStyleRule) =>
              document.querySelector(candidate.selectorText) === img
          ) as CSSStyleRule
          ;(window as any).inactiveImageRule = rule
          ;(window as any).oldImageCleanup = img.__nextImageBlur.cleanup
          const getRules = Object.getOwnPropertyDescriptor(
            CSSStyleSheet.prototype,
            'cssRules'
          ).get
          let reads = 0
          Object.defineProperty(sheet, 'cssRules', {
            configurable: true,
            get() {
              reads++
              return getRules.call(sheet)
            },
          })
          try {
            ;(window as any).oldImageCleanup()
          } finally {
            delete (sheet as any).cssRules
          }
          return {
            reads,
            rules: sheet.cssRules.length,
            declarations: rule.style.length,
            otherBackground: getComputedStyle(
              document.getElementById('second-image')
            ).backgroundImage,
          }
        })
        expect(cleaned).toEqual({
          reads: 0,
          rules: 2,
          declarations: 0,
          otherBackground: 'none',
        })
        for (let request = 0; request < 3; request++) {
          await page
            .locator('#image')
            .evaluate((img: HTMLImageElement, request) => {
              img.src = `/transparent.png?reuse=${request}`
            }, request)
          await retry(async () => {
            expect(
              await page
                .locator('#image')
                .evaluate(
                  (img: any) =>
                    img.__nextImageBlur?.src === img.src &&
                    getComputedStyle(img).backgroundImage === 'none'
                )
            ).toBe(true)
          })
          expect(
            await page.evaluate(() => {
              ;(window as any).oldImageCleanup()
              const img = document.getElementById('image') as any
              const sheet = document.querySelector<HTMLStyleElement>(
                'style[data-next-image-blur]'
              ).sheet
              return {
                rules: sheet.cssRules.length,
                reused: Array.from(sheet.cssRules).includes(
                  (window as any).inactiveImageRule
                ),
                background: getComputedStyle(img).backgroundImage,
                active: !!img.__nextImageBlur,
              }
            })
          ).toEqual({
            rules: 2,
            reused: true,
            background: 'none',
            active: true,
          })
        }
        await page.locator('#image').evaluate((img: HTMLImageElement) => {
          img.src = '/transparent.png'
        })
        await expectImageDecoded(page)
      },
      expectReactOwnsImage
    )
  })

  it.each(['stylesheet', 'inline', 'inline-zero', 'animation', 'important'])(
    'restores the user %s background and geometry before hydration',
    async (variant) => {
      async function background(page: Page, selector: string) {
        return page.locator(selector).evaluate((element) => {
          const style = getComputedStyle(element)
          return [
            style.backgroundImage,
            style.backgroundSize,
            style.backgroundPosition,
            style.backgroundRepeat,
          ]
        })
      }
      let expected: string[]
      await withDelayedHydration(
        `/styles/${variant}`,
        async (page) => {
          const originalStyle = await page
            .locator('#image')
            .getAttribute('style')
          await expectImageDecoded(page)
          expected = await background(page, '#style-reference')
          await retry(async () => {
            expect(await background(page, '#image')).toEqual(expected)
          })
          expect(await page.locator('#image').getAttribute('style')).toBe(
            originalStyle
          )
          expect(await page.locator('#loads').textContent()).toBe('0')
        },
        async (page) => {
          await retry(async () => {
            expect(await page.locator('#loads').textContent()).toBe('1')
            expect(await background(page, '#image')).toEqual(expected)
            expect(
              await page.locator('style[data-next-image-blur]').count()
            ).toBe(0)
          })
          await page.locator('#rerender').click()
          expect(await background(page, '#image')).toEqual(expected)
        }
      )
    }
  )

  it('handles images that completed before the bootstrap ran', async () => {
    await withDelayedHydration(
      '/',
      async (page) => {
        await page
          .locator('#image')
          .evaluate((img: HTMLImageElement) => img.decode())
        expect(
          await page
            .locator('#image')
            .evaluate((img) => getComputedStyle(img).backgroundImage)
        ).toContain('data:image/svg+xml')
        if (process.env.NEXT_IMAGE_BLUR_SCREENSHOT) {
          await page.screenshot({
            path: `${process.env.NEXT_IMAGE_BLUR_SCREENSHOT}-before.png`,
          })
        }
        await page
          .locator('#__next-image-blur')
          .evaluate((script: HTMLScriptElement) => {
            const executable = script.cloneNode(true) as HTMLScriptElement
            executable.removeAttribute('type')
            script.replaceWith(executable)
          })
        await retry(async () => {
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toBe('none')
        })
        if (process.env.NEXT_IMAGE_BLUR_SCREENSHOT) {
          await page.screenshot({
            path: `${process.env.NEXT_IMAGE_BLUR_SCREENSHOT}-after.png`,
          })
        }
      },
      expectReactOwnsImage,
      async (page) => {
        await transformDocument(page, (html) =>
          html.replace(
            'id="__next-image-blur"',
            'id="__next-image-blur" type="application/json"'
          )
        )
      }
    )
  })

  it('retains the React fallback when revert-layer is unavailable', async () => {
    await withDelayedHydration(
      '/',
      async (page) => {
        await page
          .locator('#image')
          .evaluate((img: HTMLImageElement) => img.decode())
        expect(
          await page
            .locator('#image')
            .evaluate((img) => getComputedStyle(img).backgroundImage)
        ).toContain('data:image/svg+xml')
      },
      expectReactOwnsImage,
      async (page) => {
        await page.addInitScript(() => {
          Object.defineProperty(CSS, 'supports', {
            value: () => false,
          })
        })
      }
    )
  })

  it('retains the React fallback when CSP blocks the inline bootstrap', async () => {
    await withDelayedHydration(
      '/blocked-bootstrap',
      async (page) => {
        await page
          .locator('#image')
          .evaluate((img: HTMLImageElement) => img.decode())
        expect(
          await page
            .locator('#image')
            .evaluate((img) => getComputedStyle(img).backgroundImage)
        ).toContain('data:image/svg+xml')
      },
      expectReactOwnsImage,
      async (page) => {
        // Deny only the image bootstrap. Turbopack itself also needs an inline
        // script, so blocking all inline scripts would prevent hydration too.
        await transformDocument(page, (html) =>
          html.replace(/<script\b[^>]*id="__next-image-blur"[^>]*>/, (tag) =>
            tag.replace(/nonce="[^"]*"/, 'nonce="blocked"')
          )
        )
      }
    )
  })

  it('retains the React fallback when CSP allows the script but blocks its stylesheet', async () => {
    await withDelayedHydration(
      '/blocked-style',
      async (page) => {
        await expectImageDecoded(page)
        expect(
          await page.evaluate(() => (document as any).__nextImageBlur)
        ).toBe(true)
        expect(
          await page
            .locator('#image')
            .evaluate((img) => getComputedStyle(img).backgroundImage)
        ).toContain('data:image/svg+xml')
        expect(await page.locator('style[data-next-image-blur]').count()).toBe(
          0
        )
      },
      expectReactOwnsImage
    )
  })

  it('cleans a completed override while a replacement request is pending', async () => {
    let releaseReplacement: () => void
    const pending = new Promise<void>((resolve) => {
      releaseReplacement = resolve
    })
    await withDelayedHydration(
      '/',
      async (page) => {
        await expectImageDecoded(page)
        await retry(async () => {
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toBe('none')
        })
        await page.locator('#image').evaluate((img: HTMLImageElement) => {
          img.src = '/transparent.png?pending'
        })
        await retry(async () => {
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toContain('data:image/svg+xml')
        })
        releaseReplacement()
        await expectImageDecoded(page)
        await retry(async () => {
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toBe('none')
        })
        await page.locator('#image').evaluate((img: HTMLImageElement) => {
          img.src = '/transparent.png'
        })
        await expectImageDecoded(page)
      },
      expectReactOwnsImage,
      async (page) => {
        await page.route('**/transparent.png?pending', async (route) => {
          await pending
          await route.continue()
        })
      },
      () => releaseReplacement()
    )
  })

  it('releases stylesheet rules for images removed before hydration', async () => {
    await withDelayedHydration(
      '/',
      async (page) => {
        await retry(async () => {
          expect(
            await page
              .locator('style[data-next-image-blur]')
              .evaluate(
                (style: HTMLStyleElement) => style.sheet.cssRules.length
              )
          ).toBe(2)
        })
        await page.evaluate(() => {
          const nodes = ['image', 'second-image'].map((id) =>
            document.getElementById(id)
          )
          ;(window as any).restoreImages = nodes.map((node) => {
            const marker = document.createComment('image position')
            node.replaceWith(marker)
            return () => marker.replaceWith(node)
          })
        })
        await retry(async () => {
          expect(
            await page.locator('style[data-next-image-blur]').count()
          ).toBe(0)
        })
        await page.evaluate(() => {
          for (const restore of (window as any).restoreImages) restore()
        })
      },
      expectReactOwnsImage
    )
  })

  it('does not let a stale decode clear a replacement image', async () => {
    let releaseReplacement: () => void
    const replacement = new Promise<void>((resolve) => {
      releaseReplacement = resolve
    })
    try {
      await withDelayedHydration(
        '/',
        async (page) => {
          await retry(async () => {
            expect(
              await page.evaluate(
                () => (window as any).pendingImageDecodes.length
              )
            ).toBeGreaterThan(0)
          })
          await page.locator('#image').evaluate((img: HTMLImageElement) => {
            img.src = '/transparent.png?replacement'
          })
          await page.evaluate(async () => {
            HTMLImageElement.prototype.decode = (
              window as any
            ).nativeImageDecode
            for (const resolve of (window as any).pendingImageDecodes) resolve()
            await new Promise(requestAnimationFrame)
          })
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toContain('data:image/svg+xml')
          releaseReplacement()
          await retry(async () => {
            expect(
              await page
                .locator('#image')
                .evaluate((img) => getComputedStyle(img).backgroundImage)
            ).toBe('none')
          })
          // Restore the SSR source before React takes ownership of the element.
          await page.locator('#image').evaluate((img: HTMLImageElement) => {
            img.src = '/transparent.png'
          })
          await expectImageDecoded(page)
        },
        expectReactOwnsImage,
        async (page) => {
          await page.route('**/transparent.png?replacement', async (route) => {
            await replacement
            await route.continue()
          })
          await page.addInitScript(() => {
            const nativeDecode = HTMLImageElement.prototype.decode
            ;(window as any).nativeImageDecode = nativeDecode
            ;(window as any).pendingImageDecodes = []
            HTMLImageElement.prototype.decode = function () {
              const decoded = nativeDecode.call(this)
              if (this.id !== 'image') return decoded
              return decoded.then(
                () =>
                  new Promise<void>((resolve) => {
                    ;(window as any).pendingImageDecodes.push(resolve)
                  })
              )
            }
          })
        },
        releaseReplacement
      )
    } finally {
      releaseReplacement()
    }
  })

  it('clears a failed image before hydration without replaying onError twice', async () => {
    await withDelayedHydration(
      '/broken',
      async (page) => {
        await retry(async () => {
          expect(
            await page.locator('#image').evaluate((img: HTMLImageElement) => ({
              complete: img.complete,
              width: img.naturalWidth,
              background: getComputedStyle(img).backgroundImage,
            }))
          ).toEqual({ complete: true, width: 0, background: 'none' })
        })
        expect(await page.locator('#errors').textContent()).toBe('0')
      },
      async (page) => {
        await retry(async () => {
          expect(await page.locator('#errors').textContent()).toBe('1')
        })
        await page.locator('#rerender').click()
        expect(await page.locator('#errors').textContent()).toBe('1')
        expect(
          await page
            .locator('#image')
            .evaluate((img) => img.getAnimations().length)
        ).toBe(0)
      }
    )
  })

  it.each(['/', '/pages-image', '/stream', '/lazy', '/csp', '/csp-pages'])(
    'removes the blur before hydration on %s',
    async (pathname) => {
      let page: Page
      let releaseHydration: () => void
      const hydration = new Promise<void>((resolve) => {
        releaseHydration = resolve
      })
      let releaseImage: () => void
      const image = new Promise<void>((resolve) => {
        releaseImage = resolve
      })
      const errors: string[] = []
      try {
        await next.browser(pathname, {
          waitHydration: false,
          waitUntil: 'commit',
          async beforePageLoad(p) {
            page = p
            p.on('console', (msg) => {
              if (msg.type() === 'error') errors.push(msg.text())
            })
            p.on('pageerror', (error) => errors.push(error.message))
            if (pathname === '/stream') {
              // Let the browser reveal React's streamed boundary. Suspend only
              // this component's hydration, not the document's script loading.
              await p.addInitScript(() => {
                window.imageHydrationGate = new Promise<void>((resolve) => {
                  window.releaseImageHydration = resolve
                })
              })
            }
            await p.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
              if (pathname !== '/stream') await hydration
              await route.continue()
            })
            await p.route(/\/transparent\.png(?:\?|$)/, async (route) => {
              await image
              await route.continue()
            })
          },
        })
        if (pathname === '/stream') {
          await page.waitForSelector('#stream-fallback', {
            state: 'attached',
            timeout: 10000,
          })
          await retry(async () => {
            const response = await next.fetch('/release-stream', {
              method: 'POST',
            })
            expect(response.status).toBe(204)
          })
        }
        // Pages Router's development-only FOUC guard hides the body until JS runs.
        await page.waitForSelector('#image', { state: 'attached' })
        const originalStyle = await page.locator('#image').getAttribute('style')
        expect(
          await page
            .locator('#image')
            .evaluate((img) => getComputedStyle(img).backgroundImage)
        ).toContain('data:image/svg+xml')
        expect(
          await page
            .locator('#image')
            .evaluate((img: HTMLImageElement) => img.complete)
        ).toBe(false)
        if (pathname === '/lazy')
          await page.locator('#image').scrollIntoViewIfNeeded()
        releaseImage()
        if (pathname === '/stream')
          await page.waitForSelector('#image', { state: 'visible' })
        await expectImageDecoded(page)
        // Read computed styles directly instead of waiting on a frame callback.
        await retry(async () => {
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toBe('none')
        })
        expect(await page.locator('#hydration').textContent()).toBe('server')
        expect(await page.locator('#loads').textContent()).toBe('0')
        await retry(async () => {
          expect(
            await page
              .locator('#second-image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toBe('none')
        })
        expect(await page.locator('#image').getAttribute('style')).toBe(
          originalStyle
        )
        expect(await page.locator('#__next-image-blur').count()).toBe(1)
        if (pathname.startsWith('/csp')) {
          expect(
            await page
              .locator('#__next-image-blur')
              .evaluate((script: HTMLScriptElement) => script.nonce)
          ).toBe('image-blur-test-nonce')
          expect(
            await page
              .locator('style[data-next-image-blur]')
              .evaluate((style: HTMLStyleElement) => style.nonce)
          ).toBe('image-blur-test-nonce')
        }
        const before = await page.locator('#image').evaluate((img) => ({
          complete: (img as HTMLImageElement).complete,
          naturalWidth: (img as HTMLImageElement).naturalWidth,
          background: getComputedStyle(img).backgroundImage,
        }))
        if (
          process.env.NEXT_IMAGE_BLUR_SCREENSHOT &&
          (pathname === '/' || pathname === '/pages-image')
        ) {
          await page.screenshot({
            path: `${process.env.NEXT_IMAGE_BLUR_SCREENSHOT}-${pathname === '/' ? 'app' : 'pages'}.png`,
          })
        }
        releaseHydration()
        if (pathname === '/stream')
          await page.evaluate(() => window.releaseImageHydration?.())
        await retry(async () => {
          expect(await page.locator('#hydration').textContent()).toBe(
            'hydrated'
          )
          expect(await page.locator('#loads').textContent()).toBe('1')
          expect(
            await page
              .locator('#image')
              .evaluate((img) => getComputedStyle(img).backgroundImage)
          ).toBe('none')
        })
        await page.locator('#rerender').click()
        expect(await page.locator('#loads').textContent()).toBe('1')
        expect(
          await page
            .locator('#image')
            .evaluate((img) => img.getAnimations().length)
        ).toBe(0)
        await page.locator('#change-src').click()
        await retry(async () => {
          expect(await page.locator('#loads').textContent()).toBe('2')
        })
        expect(errors).toEqual([])
        expect(before.complete).toBe(true)
        expect(before.naturalWidth).toBeGreaterThan(0)
        expect(before.background).toBe('none')
      } finally {
        releaseHydration()
        releaseImage()
        if (pathname === '/stream')
          await page
            ?.evaluate(() => window.releaseImageHydration?.())
            .catch(() => {})
        await page?.unrouteAll({ behavior: 'wait' })
      }
    }
  )
})
