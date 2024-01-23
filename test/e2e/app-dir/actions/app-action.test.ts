/* eslint-disable jest/no-standalone-expect */
import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'
import { Request, Response } from 'playwright-chromium'
import fs from 'fs-extra'
import { join } from 'path'

const GENERIC_RSC_ERROR =
  'Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

createNextDescribe(
  'app-dir action handling',
  {
    files: __dirname,
    dependencies: {
      react: 'latest',
      nanoid: 'latest',
      'react-dom': 'latest',
      'server-only': 'latest',
    },
  },
  ({ next, isNextDev, isNextStart, isNextDeploy, isTurbopack }) => {
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
        const id = res.split(':', 2)
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
        const id = res.split(':', 3)
        return id[0] === id[1] && id[0] === id[2] && id[0]
          ? 'same'
          : 'different'
      }, 'same')
    })

    it('should push new route when redirecting', async () => {
      const browser = await next.browser('/header')

      await browser.elementByCss('#setCookieAndRedirect').click()
      await check(async () => {
        return (await browser.elementByCss('#redirected').text()) || ''
      }, 'redirected')

      // Ensure we can navigate back
      await browser.back()

      await check(async () => {
        return (
          (await browser.elementByCss('#setCookieAndRedirect').text()) || ''
        )
      }, 'setCookieAndRedirect')
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
      const setCookieHeader = res.headers.get('set-cookie')
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
      }, '/header?name=test&hidden-info=hi')
    })

    it('should support .bind', async () => {
      const browser = await next.browser('/server')

      await browser.eval(`document.getElementById('n').value = '123'`)
      await browser.elementByCss('#minus-one').click()

      await check(() => {
        return browser.eval('window.location.pathname + window.location.search')
      }, '/header?result=122')
    })

    it('should support chained .bind', async () => {
      const browser = await next.browser('/server')

      await browser.elementByCss('#add3').click()

      await check(() => {
        return browser.eval('window.location.pathname + window.location.search')
      }, '/header?result=6')
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

    it('should support importing the same action module instance in both server and action layers', async () => {
      const browser = await next.browser('/shared')

      const v = await browser.elementByCss('#value').text()
      expect(v).toBe('Value = 0')

      await browser.elementByCss('#server-inc').click()
      await check(() => browser.elementByCss('#value').text(), 'Value = 1')

      await browser.elementByCss('#client-inc').click()
      await check(() => browser.elementByCss('#value').text(), 'Value = 2')
    })

    it('should not block navigation events while a server action is in flight', async () => {
      let browser = await next.browser('/client')

      await browser.elementByCss('#slow-inc').click()

      // navigate to server
      await browser.elementByCss('#navigate-server').click()
      // intentionally bailing after 2 retries so we don't retry to the point where the async function resolves
      await check(() => browser.url(), `${next.url}/server`, true, 2)

      browser = await next.browser('/server')

      await browser.elementByCss('#slow-inc').click()

      // navigate to client
      await browser.elementByCss('#navigate-client').click()
      // intentionally bailing after 2 retries so we don't retry to the point where the async function resolves
      await check(() => browser.url(), `${next.url}/client`, true, 2)
    })

    it('should trigger a refresh for a server action that gets discarded due to a navigation', async () => {
      let browser = await next.browser('/client')
      const initialRandomNumber = await browser
        .elementByCss('#random-number')
        .text()

      await browser.elementByCss('#slow-inc').click()

      // navigate to server
      await browser.elementByCss('#navigate-server').click()

      // wait for the action to be completed
      await check(async () => {
        const newRandomNumber = await browser
          .elementByCss('#random-number')
          .text()

        return newRandomNumber === initialRandomNumber ? 'fail' : 'success'
      }, 'success')
    })

    it('should support next/dynamic with ssr: false', async () => {
      const browser = await next.browser('/dynamic-csr')

      await check(() => {
        return browser.elementByCss('button').text()
      }, '0')

      await browser.elementByCss('button').click()

      await check(() => {
        return browser.elementByCss('button').text()
      }, '1')
    })

    it('should support next/dynamic with ssr: false (edge)', async () => {
      const browser = await next.browser('/dynamic-csr/edge')

      await check(() => {
        return browser.elementByCss('button').text()
      }, '0')

      await browser.elementByCss('button').click()

      await check(() => {
        return browser.elementByCss('button').text()
      }, '1')
    })

    it('should only submit action once when resubmitting an action after navigation', async () => {
      let requestCount = 0

      const browser = await next.browser('/server', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (url.pathname === '/server') {
              requestCount++
            }
          })
        },
      })

      async function submitForm() {
        await browser.elementById('name').type('foo')
        await browser.elementById('submit').click()
        await check(() => browser.url(), /header/)
      }

      await submitForm()

      await browser.elementById('navigate-server').click()
      await check(() => browser.url(), /server/)
      await browser.waitForIdleNetwork()

      requestCount = 0

      await submitForm()

      expect(requestCount).toBe(1)
    })

    it('should handle actions executed in quick succession', async () => {
      let requestCount = 0
      const browser = await next.browser('/use-transition', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (url.pathname === '/use-transition') {
              requestCount++
            }
          })
        },
      })

      expect(await browser.elementByCss('h1').text()).toBe(
        'Transition is: idle'
      )
      const button = await browser.elementById('action-button')

      // fire off 6 successive requests by clicking the button 6 times
      for (let i = 0; i < 6; i++) {
        await button.click()

        // add a little bit of delay to simulate user behavior & give
        // the requests a moment to start running
        await waitFor(500)
      }

      expect(await browser.elementByCss('h1').text()).toBe(
        'Transition is: pending'
      )

      await check(() => requestCount, 6)

      await check(
        () => browser.elementByCss('h1').text(),
        'Transition is: idle'
      )
    })

    it('should 404 when POSTing an invalid server action', async () => {
      const cliOutputPosition = next.cliOutput.length
      const res = await next.fetch('/non-existent-route', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'foo=bar',
      })

      const cliOutput = next.cliOutput.slice(cliOutputPosition)

      expect(cliOutput).not.toContain('TypeError')
      expect(cliOutput).not.toContain(
        'Missing `origin` header from a forwarded Server Actions request'
      )
      expect(res.status).toBe(404)
    })

    it('should log a warning when a server action is not found but an id is provided', async () => {
      await next.fetch('/server', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'next-action': 'abc123',
        },
        body: 'foo=bar',
      })

      await check(
        () => next.cliOutput,
        /Failed to find Server Action "abc123". This request might be from an older or newer deployment./
      )
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
          const filePath = 'app/server/actions-3.js'
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

            await check(async () => {
              await browser.elementByCss('#inc').click()
              const val = Number(await browser.elementByCss('h1').text())
              return val > 1000 ? 'success' : val
            }, 'success')
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })
      })

      it('should bundle external libraries if they are on the action layer', async () => {
        await next.fetch('/client')
        const pageBundle = await fs.readFile(
          join(next.testDir, '.next', 'server', 'app', 'client', 'page.js')
        )
        if (isTurbopack) {
          const chunkPaths = pageBundle
            .toString()
            .matchAll(/loadChunk\("([^"]*)"\)/g)
          // @ts-ignore
          const reads = [...chunkPaths].map(async (match) => {
            const bundle = await fs.readFile(
              join(next.testDir, '.next', ...match[1].split(/[\\/]/g))
            )
            return bundle.toString().includes('node_modules/nanoid/index.js')
          })

          expect(await Promise.all(reads)).toContain(true)
        } else {
          expect(pageBundle.toString()).toContain(
            'node_modules/nanoid/index.js'
          )
        }
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

        await waitFor(3000)

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
        }, 'https://next-data-api-endpoint.vercel.app/api/random?page')
      })

      it('should allow cookie and header async storages', async () => {
        const browser = await next.browser('/client/edge')

        const currentTestCookie = await browser.eval(
          `document.cookie.match(/test-cookie=(\\d+)/)?.[1]`
        )

        await browser.elementByCss('#get-headers').click()

        await check(async () => {
          const newTestCookie = await browser.eval(
            `document.cookie.match(/test-cookie=(\\d+)/)?.[1]`
          )
          return newTestCookie !== currentTestCookie ? 'success' : 'failure'
        }, 'success')
      })

      it('should handle unicode search params', async () => {
        const browser = await next.browser('/server?name=名')

        const cnt = await browser.elementByCss('h1').text()
        expect(cnt).toBe('0')

        await browser.elementByCss('#inc').click()
        await check(() => browser.elementByCss('h1').text(), '1')
      })
    })

    describe('fetch actions', () => {
      it('should handle a fetch action initiated from a static page', async () => {
        const browser = await next.browser('/client-static')
        await check(() => browser.elementByCss('#count').text(), '0')

        await browser.elementByCss('#increment').click()
        await check(() => browser.elementByCss('#count').text(), '1')

        await browser.elementByCss('#increment').click()
        await check(() => browser.elementByCss('#count').text(), '2')
      })

      it('should handle redirect to a relative URL in a single pass', async () => {
        let responseCode: number
        const browser = await next.browser('/client', {
          beforePageLoad(page) {
            page.on('response', async (res: Response) => {
              const headers = await res.allHeaders()
              if (headers['x-action-redirect']) {
                responseCode = res.status()
              }
            })
          },
        })

        await waitFor(3000)

        let requests = []

        browser.on('request', (req: Request) => {
          requests.push(new URL(req.url()).pathname)
        })

        await browser.elementByCss('#redirect').click()

        // no other requests should be made
        expect(requests).toEqual(['/client'])
        await check(() => responseCode, 303)
      })

      it('should handle regular redirects', async () => {
        const browser = await next.browser('/client')

        await browser.elementByCss('#redirect-external').click()

        await check(async () => {
          return browser.eval('window.location.toString()')
        }, 'https://next-data-api-endpoint.vercel.app/api/random?page')
      })

      // TODO: investigate flakey behavior with revalidate
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

      // TODO: investigate flakey behavior with revalidate
      it('should handle revalidateTag', async () => {
        const browser = await next.browser('/revalidate')
        const randomNumber = await browser.elementByCss('#random-number').text()
        const justPutIt = await browser.elementByCss('#justputit').text()
        const thankYouNext = await browser.elementByCss('#thankyounext').text()

        await browser.elementByCss('#revalidate-justputit').click()

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
      })

      // TODO: investigate flakey behavior with revalidate
      it.skip('should handle revalidateTag + redirect', async () => {
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

      it('should invalidate client cache on other routes when cookies.set is called', async () => {
        const browser = await next.browser('/mutate-cookie')
        await browser.elementByCss('#update-cookie').click()

        let cookie
        await check(async () => {
          cookie = await browser.elementByCss('#value').text()
          return parseInt(cookie) > 0 ? 'success' : 'failure'
        }, 'success')

        // Make sure the route is cached
        await browser.elementByCss('#page-2').click()
        await browser.elementByCss('#back').click()

        // Modify the cookie
        await browser.elementByCss('#update-cookie').click()
        let newCookie
        await check(async () => {
          newCookie = await browser.elementByCss('#value').text()
          return newCookie !== cookie && parseInt(newCookie) > 0
            ? 'success'
            : 'failure'
        }, 'success')

        // Navigate to another page and make sure the cookie is not cached
        await browser.elementByCss('#page-2').click()
        const otherPageCookie = await browser.elementByCss('#value').text()
        expect(otherPageCookie).toEqual(newCookie)
      })

      // TODO: investigate flakey behavior with revalidate
      it('should revalidate when cookies.set is called in a client action', async () => {
        const browser = await next.browser('/revalidate')
        await browser.refresh()

        let randomCookie
        await check(async () => {
          randomCookie = JSON.parse(
            await browser.elementByCss('#random-cookie').text()
          ).value
          return randomCookie ? 'success' : 'failure'
        }, 'success')

        console.log(123, await browser.elementByCss('body').text())

        await browser.elementByCss('#another').click()
        await check(async () => {
          return browser.elementByCss('#title').text()
        }, 'another route')

        const newRandomCookie = JSON.parse(
          await browser.elementByCss('#random-cookie').text()
        ).value

        console.log(456, await browser.elementByCss('body').text())

        // Should be the same value
        expect(randomCookie).toEqual(newRandomCookie)

        await browser.elementByCss('#back').click()

        // Modify the cookie
        await browser.elementByCss('#set-cookie').click()

        // Should be different
        let revalidatedRandomCookie
        await check(async () => {
          revalidatedRandomCookie = JSON.parse(
            await browser.elementByCss('#random-cookie').text()
          ).value
          return randomCookie !== revalidatedRandomCookie
            ? 'success'
            : 'failure'
        }, 'success')

        await browser.elementByCss('#another').click()

        // The other page should be revalidated too
        await check(async () => {
          const newRandomCookie = await JSON.parse(
            await browser.elementByCss('#random-cookie').text()
          ).value
          return revalidatedRandomCookie === newRandomCookie
            ? 'success'
            : 'failure'
        }, 'success')
      })

      it.each(['tag', 'path'])(
        'should invalidate client cache when %s is revalidated',
        async (type) => {
          const browser = await next.browser('/revalidate')
          await browser.refresh()

          const thankYouNext = await browser
            .elementByCss('#thankyounext')
            .text()

          await browser.elementByCss('#another').click()
          await check(async () => {
            return browser.elementByCss('#title').text()
          }, 'another route')

          const newThankYouNext = await browser
            .elementByCss('#thankyounext')
            .text()

          // Should be the same number
          expect(thankYouNext).toEqual(newThankYouNext)

          await browser.elementByCss('#back').click()

          // Should be different
          let revalidatedThankYouNext
          await check(async () => {
            switch (type) {
              case 'tag':
                await browser.elementByCss('#revalidate-thankyounext').click()
                break
              case 'path':
                await browser.elementByCss('#revalidate-path').click()
                break
              default:
                throw new Error(`Invalid type: ${type}`)
            }

            revalidatedThankYouNext = await browser
              .elementByCss('#thankyounext')
              .text()
            return thankYouNext !== revalidatedThankYouNext
              ? 'success'
              : 'failure'
          }, 'success')

          await browser.elementByCss('#another').click()

          // The other page should be revalidated too
          await check(async () => {
            const newThankYouNext = await browser
              .elementByCss('#thankyounext')
              .text()
            return revalidatedThankYouNext === newThankYouNext
              ? 'success'
              : 'failure'
          }, 'success')
        }
      )
    })

    it('should work with interception routes', async () => {
      const browser = await next.browser('/interception-routes')

      await check(
        () => browser.elementById('children-data').text(),
        /Open modal/
      )

      await browser.elementByCss("[href='/interception-routes/test']").click()

      // verify the URL is correct
      await check(() => browser.url(), /interception-routes\/test/)

      // the intercepted text should appear
      await check(() => browser.elementById('modal-data').text(), /in "modal"/)

      // Submit the action
      await browser.elementById('submit-intercept-action').click()

      // Action log should be in server console
      await check(() => next.cliOutput, /Action Submitted \(Intercepted\)/)

      await browser.refresh()

      // the modal text should be gone
      expect(await browser.hasElementByCssSelector('#modal-data')).toBeFalsy()

      // The page text should show
      await check(
        () => browser.elementById('children-data').text(),
        /in "page"/
      )

      // Submit the action
      await browser.elementById('submit-page-action').click()

      // Action log should be in server console
      await check(() => next.cliOutput, /Action Submitted \(Page\)/)
    })

    describe('encryption', () => {
      it('should send encrypted values from the closed over closure', async () => {
        const res = await next.fetch('/encryption')
        const html = await res.text()
        expect(html).not.toContain('qwerty123')
      })
    })

    describe('redirects', () => {
      it('redirects properly when server action handler uses `redirect`', async () => {
        const postRequests = []
        const responseCodes = []

        const browser = await next.browser('/redirects', {
          beforePageLoad(page) {
            page.on('request', (request: Request) => {
              const url = new URL(request.url())
              if (request.method() === 'POST') {
                postRequests.push(url.pathname)
              }
            })

            page.on('response', (response: Response) => {
              const url = new URL(response.url())
              const status = response.status()

              if (postRequests.includes(`${url.pathname}${url.search}`)) {
                responseCodes.push(status)
              }
            })
          },
        })
        await browser.elementById('submit-api-redirect').click()
        await check(() => browser.url(), /success=true/)

        // verify that the POST request was only made to the action handler
        expect(postRequests).toEqual(['/redirects/api-redirect'])
        expect(responseCodes).toEqual([303])
      })

      it('redirects properly when server action handler uses `permanentRedirect`', async () => {
        const postRequests = []
        const responseCodes = []

        const browser = await next.browser('/redirects', {
          beforePageLoad(page) {
            page.on('request', (request: Request) => {
              const url = new URL(request.url())
              if (request.method() === 'POST') {
                postRequests.push(url.pathname)
              }
            })

            page.on('response', (response: Response) => {
              const url = new URL(response.url())
              const status = response.status()

              if (postRequests.includes(`${url.pathname}${url.search}`)) {
                responseCodes.push(status)
              }
            })
          },
        })

        await browser.elementById('submit-api-redirect-permanent').click()
        await check(() => browser.url(), /success=true/)

        // verify that the POST request was only made to the action handler
        expect(postRequests).toEqual(['/redirects/api-redirect-permanent'])
        expect(responseCodes).toEqual([303])
      })

      it.each(['307', '308'])(
        `redirects properly when server action handler redirects with a %s status code`,
        async (statusCode) => {
          const postRequests = []
          const responseCodes = []

          const browser = await next.browser('/redirects', {
            beforePageLoad(page) {
              page.on('request', (request: Request) => {
                const url = new URL(request.url())
                if (request.method() === 'POST') {
                  postRequests.push(`${url.pathname}${url.search}`)
                }
              })

              page.on('response', (response: Response) => {
                const url = new URL(response.url())
                const status = response.status()

                if (postRequests.includes(`${url.pathname}${url.search}`)) {
                  responseCodes.push(status)
                }
              })
            },
          })

          await browser.elementById(`submit-api-redirect-${statusCode}`).click()
          await check(() => browser.url(), /success=true/)
          expect(await browser.elementById('redirect-page')).toBeTruthy()

          // since a 307/308 status code follows the redirect, the POST request should be made to both the action handler and the redirect target
          expect(postRequests).toEqual([
            `/redirects/api-redirect-${statusCode}`,
            `/redirects?success=true`,
          ])

          expect(responseCodes).toEqual([Number(statusCode), 200])
        }
      )
    })

    describe('server actions render client components', () => {
      describe('server component imported action', () => {
        it('should support importing client components from actions', async () => {
          const browser = await next.browser(
            '/server/action-return-client-component'
          )
          expect(
            await browser
              .elementByCss('#trigger-component-load')
              .click()
              .waitForElementByCss('#client-component')
              .text()
          ).toBe('Hello World')
        })
      })

      // Server Component -> Client Component -> Server Action (imported from client component) -> Import Client Component is not not supported yet.
      describe.skip('client component imported action', () => {
        it('should support importing client components from actions', async () => {
          const browser = await next.browser(
            '/client/action-return-client-component'
          )
          expect(
            await browser
              .elementByCss('#trigger-component-load')
              .click()
              .waitForElementByCss('#client-component')
              .text()
          ).toBe('Hello World')
        })
      })
    })

    describe('caching disabled by default', () => {
      it('should use no-store as default for server action', async () => {
        const browser = await next.browser('/no-caching-in-actions')
        await browser
          .waitForElementByCss('#trigger-fetch')
          .click()
          .waitForElementByCss('#fetched-data')

        const getNumber = async () =>
          JSON.parse(await browser.elementByCss('#fetched-data').text())

        const firstNumber = await getNumber()

        await browser.waitForElementByCss('#trigger-fetch').click()

        await check(async () => {
          const newNumber = await getNumber()
          // Expect that the number changes on each click
          expect(newNumber).not.toBe(firstNumber)

          return 'success'
        }, 'success')
      })

      it('should not override force-cache in server action', async () => {
        const browser = await next.browser('/no-caching-in-actions/force-cache')
        await browser
          .waitForElementByCss('#trigger-fetch')
          .click()
          .waitForElementByCss('#fetched-data')

        const getNumber = async () =>
          JSON.parse(await browser.elementByCss('#fetched-data').text())

        const firstNumber = await getNumber()

        await browser.waitForElementByCss('#trigger-fetch').click()

        await check(async () => {
          const newNumber = await getNumber()
          // Expect that the number is the same on each click
          expect(newNumber).toBe(firstNumber)

          return 'success'
        }, 'success')
      })

      // Implicit force-cache
      it('should not override revalidate in server action', async () => {
        const browser = await next.browser('/no-caching-in-actions/revalidate')
        await browser
          .waitForElementByCss('#trigger-fetch')
          .click()
          .waitForElementByCss('#fetched-data')

        const getNumber = async () =>
          JSON.parse(await browser.elementByCss('#fetched-data').text())

        const firstNumber = await getNumber()

        await browser.waitForElementByCss('#trigger-fetch').click()

        await check(async () => {
          const newNumber = await getNumber()
          // Expect that the number is the same on each click
          expect(newNumber).toBe(firstNumber)

          return 'success'
        }, 'success')
      })
    })
  }
)
