import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { Request } from 'playwright-chromium'
import fs from 'fs-extra'
import { join } from 'path'

const GENERIC_RSC_ERROR =
  'Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

createNextDescribe(
  'app-dir action handling',
  {
    files: __dirname,
  },
  ({ next, isNextDev, isNextStart, isNextDeploy }) => {
    it('should handle basic actions correctly', async () => {
      const browser = await next.browser('/server')

      const cnt = await browser.elementByCss('h1').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '1')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '2')

      await browser.elementByCss('#double').click()
      await check(() => browser.elementByCss('h1').text(), '4')

      await browser.elementByCss('#dec').click()
      await check(() => browser.elementByCss('h1').text(), '3')
    })

    it('should support headers and cookies', async () => {
      const browser = await next.browser('/header')

      await browser.elementByCss('#cookie').click()
      await check(async () => {
        const res = (await browser.elementByCss('h1').text()) || ''
        const id = res.split(':')
        return id[0] === id[1] && id[0] ? 'same' : 'different'
      }, 'same')

      await browser.elementByCss('#header').click()
      await check(async () => {
        const res = (await browser.elementByCss('h1').text()) || ''
        return res.includes('Mozilla') ? 'UA' : ''
      }, 'UA')

      // Set cookies
      await browser.elementByCss('#setCookie').click()
      await check(async () => {
        const res = (await browser.elementByCss('h1').text()) || ''
        const id = res.split(':')
        return id[0] === id[1] && id[0] === id[2] && id[0]
          ? 'same'
          : 'different'
      }, 'same')
    })

    it('should support headers in client imported actions', async () => {
      const logs: string[] = []
      next.on('stdout', (log) => {
        logs.push(log)
      })
      next.on('stderr', (log) => {
        logs.push(log)
      })

      const currentTimestamp = Date.now()

      const browser = await next.browser('/client')
      await browser.elementByCss('#get-header').click()

      // we don't have access to runtime logs on deploy
      if (!isNextDeploy) {
        await check(() => {
          return logs.some((log) =>
            log.includes('accept header: text/x-component')
          )
            ? 'yes'
            : ''
        }, 'yes')
      }

      await check(() => browser.eval('document.cookie'), /test-cookie/)

      expect(
        await browser.eval('+document.cookie.match(/test-cookie=(\\d+)/)[1]')
      ).toBeGreaterThanOrEqual(currentTimestamp)
    })

    it('should support setting cookies in route handlers with the correct overrides', async () => {
      const res = await next.fetch('/handler')
      const setCookieHeader = res.headers.get('set-cookie') as string[]
      expect(setCookieHeader).toContain('bar=bar2; Path=/')
      expect(setCookieHeader).toContain('baz=baz2; Path=/')
      expect(setCookieHeader).toContain('foo=foo1; Path=/')
      expect(setCookieHeader).toContain('test1=value1; Path=/; Secure')
      expect(setCookieHeader).toContain('test2=value2; Path=/handler; HttpOnly')
    })

    it('should support formData and redirect', async () => {
      const browser = await next.browser('/server')

      await browser.eval(`document.getElementById('name').value = 'test'`)
      await browser.elementByCss('#submit').click()

      await check(() => {
        return browser.eval('window.location.pathname + window.location.search')
      }, '/header?name=test&constructor=FormData')
    })

    it('should support .bind', async () => {
      const browser = await next.browser('/server')

      await browser.eval(`document.getElementById('n').value = '123'`)
      await browser.elementByCss('#minus-one').click()

      await check(() => {
        return browser.eval('window.location.pathname + window.location.search')
      }, '/header?result=122')
    })

    it('should support notFound (javascript disabled)', async () => {
      const browser = await next.browser('/server', {
        // TODO we should also test this with javascript on but not-found is not implemented yet.
        disableJavaScript: true,
      })

      await browser.elementByCss('#nowhere').click()

      await check(() => {
        return browser.elementByCss('h1').text()
      }, 'my-not-found')
    })

    it('should support notFound', async () => {
      const browser = await next.browser('/server')

      await browser.elementByCss('#nowhere').click()

      await check(() => {
        return browser.elementByCss('h1').text()
      }, 'my-not-found')
    })

    it('should support uploading files', async () => {
      const logs: string[] = []
      next.on('stdout', (log) => {
        logs.push(log)
      })
      next.on('stderr', (log) => {
        logs.push(log)
      })

      const browser = await next.browser('/server')

      // Fake a file to upload
      await browser.eval(`
        const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
        const list = new DataTransfer();
        list.items.add(file);
        document.getElementById('file').files = list.files;
      `)

      await browser.elementByCss('#upload').click()

      // we don't have access to runtime logs on deploy
      if (!isNextDeploy) {
        await check(() => {
          return logs.some((log) =>
            log.includes('File name: hello.txt size: 5')
          )
            ? 'yes'
            : ''
        }, 'yes')
      }
    })

    it('should support hoc auth wrappers', async () => {
      const browser = await next.browser('/header')
      await browser.eval(`document.cookie = 'auth=0'`)

      await browser.elementByCss('#authed').click()

      await check(
        () => {
          return browser.elementByCss('h1').text()
        },
        isNextDev ? 'Error: Unauthorized request' : GENERIC_RSC_ERROR
      )

      await browser.eval(`document.cookie = 'auth=1'`)

      await browser.elementByCss('#authed').click()

      await check(() => {
        return browser.elementByCss('h1').text()
      }, 'Prefix: HELLO, WORLD')
    })

    it('should support importing actions in client components', async () => {
      const browser = await next.browser('/client')

      const cnt = await browser.elementByCss('h1').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '1')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '2')

      await browser.elementByCss('#double').click()
      await check(() => browser.elementByCss('h1').text(), '4')

      await browser.elementByCss('#dec').click()
      await check(() => browser.elementByCss('h1').text(), '3')
    })

    if (isNextStart) {
      it('should not expose action content in sourcemaps', async () => {
        const sourcemap = (
          await fs.readdir(
            join(next.testDir, '.next', 'static', 'chunks', 'app', 'client')
          )
        ).find((f) => f.endsWith('.js.map'))

        expect(sourcemap).toBeDefined()

        expect(
          await next.readFile(
            join('.next', 'static', 'chunks', 'app', 'client', sourcemap)
          )
        ).not.toContain('this_is_sensitive_info')
      })
    }

    if (isNextDev) {
      describe('HMR', () => {
        it('should support updating the action', async () => {
          const filePath = 'app/server/actions.js'
          const origContent = await next.readFile(filePath)

          try {
            const browser = await next.browser('/server')

            const cnt = await browser.elementByCss('h1').text()
            expect(cnt).toBe('0')

            await browser.elementByCss('#inc').click()
            await check(() => browser.elementByCss('h1').text(), '1')

            await next.patchFile(
              filePath,
              origContent.replace('return value + 1', 'return value + 1000')
            )

            await browser.elementByCss('#inc').click()
            await check(() => browser.elementByCss('h1').text(), '1001')
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })
      })
    }

    describe('Edge SSR', () => {
      it('should handle basic actions correctly', async () => {
        const browser = await next.browser('/server/edge')

        const cnt = await browser.elementByCss('h1').text()
        expect(cnt).toBe('0')

        await browser.elementByCss('#inc').click()
        await check(() => browser.elementByCss('h1').text(), '1')

        await browser.elementByCss('#inc').click()
        await check(() => browser.elementByCss('h1').text(), '2')

        await browser.elementByCss('#double').click()
        await check(() => browser.elementByCss('h1').text(), '4')

        await browser.elementByCss('#dec').click()
        await check(() => browser.elementByCss('h1').text(), '3')
      })

      it('should return error response for hoc auth wrappers in edge runtime', async () => {
        const browser = await next.browser('/header/edge')
        await await browser.eval(`document.cookie = 'edge-auth=0'`)

        await browser.elementByCss('#authed').click()

        await check(
          () => browser.elementByCss('h1').text(),
          isNextDev ? 'Error: Unauthorized request' : GENERIC_RSC_ERROR
        )

        await browser.eval(`document.cookie = 'edge-auth=1'`)

        await browser.elementByCss('#authed').click()

        await check(() => {
          return browser.elementByCss('h1').text()
        }, 'Prefix: HELLO, WORLD')
      })

      it('should handle redirect to a relative URL in a single pass', async () => {
        const browser = await next.browser('/client/edge')

        await new Promise((resolve) => {
          setTimeout(resolve, 3000)
        })

        let requests = []

        browser.on('request', (req: Request) => {
          requests.push(new URL(req.url()).pathname)
        })

        await browser.elementByCss('#redirect').click()

        // no other requests should be made
        expect(requests).toEqual(['/client/edge'])
      })

      it('should handle regular redirects', async () => {
        const browser = await next.browser('/client/edge')

        await browser.elementByCss('#redirect-external').click()

        await check(async () => {
          return browser.eval('window.location.toString()')
        }, 'https://example.com/')
      })
    })

    describe('fetch actions', () => {
      it('should handle redirect to a relative URL in a single pass', async () => {
        const browser = await next.browser('/client')

        await new Promise((resolve) => {
          setTimeout(resolve, 3000)
        })

        let requests = []

        browser.on('request', (req: Request) => {
          requests.push(new URL(req.url()).pathname)
        })

        await browser.elementByCss('#redirect').click()

        // no other requests should be made
        expect(requests).toEqual(['/client'])
      })

      it('should handle regular redirects', async () => {
        const browser = await next.browser('/client')

        await browser.elementByCss('#redirect-external').click()

        await check(async () => {
          return browser.eval('window.location.toString()')
        }, 'https://example.com/')
      })

      it('should handle revalidatePath', async () => {
        const browser = await next.browser('/revalidate')
        const randomNumber = await browser.elementByCss('#random-number').text()
        const justPutIt = await browser.elementByCss('#justputit').text()
        const thankYouNext = await browser.elementByCss('#thankyounext').text()

        await browser.elementByCss('#revalidate-path').click()

        await check(async () => {
          const newRandomNumber = await browser
            .elementByCss('#random-number')
            .text()
          const newJustPutIt = await browser.elementByCss('#justputit').text()
          const newThankYouNext = await browser
            .elementByCss('#thankyounext')
            .text()

          return newRandomNumber !== randomNumber &&
            justPutIt !== newJustPutIt &&
            thankYouNext !== newThankYouNext
            ? 'success'
            : 'failure'
        }, 'success')
      })

      it('should handle revalidateTag', async () => {
        const browser = await next.browser('/revalidate')
        const randomNumber = await browser.elementByCss('#random-number').text()
        const justPutIt = await browser.elementByCss('#justputit').text()
        const thankYouNext = await browser.elementByCss('#thankyounext').text()

        await browser.elementByCss('#revalidate-justputit').click()

        // TODO: investigate flakiness when deployed
        if (!isNextDeploy) {
          await check(async () => {
            const newRandomNumber = await browser
              .elementByCss('#random-number')
              .text()
            const newJustPutIt = await browser.elementByCss('#justputit').text()
            const newThankYouNext = await browser
              .elementByCss('#thankyounext')
              .text()

            expect(newRandomNumber).not.toBe(randomNumber)
            expect(newJustPutIt).not.toBe(justPutIt)
            expect(newThankYouNext).toBe(thankYouNext)

            return 'success'
          }, 'success')
        }
      })

      it('should handle revalidateTag + redirect', async () => {
        const browser = await next.browser('/revalidate')
        const randomNumber = await browser.elementByCss('#random-number').text()
        const justPutIt = await browser.elementByCss('#justputit').text()
        const thankYouNext = await browser.elementByCss('#thankyounext').text()

        await browser.elementByCss('#revalidate-path-redirect').click()

        await check(async () => {
          const newRandomNumber = await browser
            .elementByCss('#random-number')
            .text()
          const newJustPutIt = await browser.elementByCss('#justputit').text()
          const newThankYouNext = await browser
            .elementByCss('#thankyounext')
            .text()

          expect(newRandomNumber).toBe(randomNumber)
          expect(newJustPutIt).not.toBe(justPutIt)
          expect(newThankYouNext).toBe(thankYouNext)

          return 'success'
        }, 'success')
      })

      it('should store revalidation data in the prefetch cache', async () => {
        const browser = await next.browser('/revalidate')
        const justPutIt = await browser.elementByCss('#justputit').text()
        await browser.elementByCss('#revalidate-justputit').click()

        // TODO: investigate flakiness when deployed
        if (!isNextDeploy) {
          await check(async () => {
            const newJustPutIt = await browser.elementByCss('#justputit').text()
            expect(newJustPutIt).not.toBe(justPutIt)
            return 'success'
          }, 'success')
        }

        const newJustPutIt = await browser.elementByCss('#justputit').text()

        await browser
          .elementByCss('#navigate-client')
          .click()
          .waitForElementByCss('#inc')
        await browser
          .elementByCss('#navigate-revalidate')
          .click()
          .waitForElementByCss('#revalidate-justputit')

        const newJustPutIt2 = await browser.elementByCss('#justputit').text()

        expect(newJustPutIt).toEqual(newJustPutIt2)
      })

      it('should revalidate when cookies.set is called', async () => {
        const browser = await next.browser('/revalidate')
        const randomNumber = await browser.elementByCss('#random-cookie').text()

        await browser.elementByCss('#set-cookie').click()

        await check(async () => {
          const newRandomNumber = await browser
            .elementByCss('#random-cookie')
            .text()

          return newRandomNumber !== randomNumber ? 'success' : 'failure'
        }, 'success')
      })
    })
  }
)
