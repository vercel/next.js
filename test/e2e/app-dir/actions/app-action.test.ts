import { FileRef, nextTestSetup } from 'e2e-utils'
import {
  assertHasRedbox,
  retry,
  check,
  waitFor,
  getRedboxSource,
  getDistDir,
} from 'next-test-utils'
import type { Request, Response } from 'playwright'
import fs from 'node:fs/promises'
import { join } from 'node:path'

const GENERIC_RSC_ERROR =
  'Error: An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

describe('app-dir action handling', () => {
  const { next, isNextDev, isNextStart, isNextDeploy, isTurbopack } =
    nextTestSetup({
      files: __dirname,
      overrideFiles: process.env.TEST_NODE_MIDDLEWARE
        ? {
            'middleware.js': new FileRef(join(__dirname, 'middleware-node.js')),
          }
        : {},
      dependencies: {
        nanoid: '4.0.1',
        'server-only': 'latest',
      },
    })

  if (isNextStart) {
    it('should output exportName and filename info in manifest', async () => {
      const referenceManifest = await next.readJSON(
        `${getDistDir()}/server/server-reference-manifest.json`
      )
      let foundExportNames = []

      for (const item in referenceManifest.node) {
        try {
          const itemInfo = referenceManifest.node[item]

          foundExportNames.push(itemInfo.exportedName)

          expect(itemInfo.filename).toBeString()
          // can be outside app dir but this test suite has them all in app
          expect(itemInfo.filename).toStartWith('app/')
          expect(itemInfo.exportedName).toBeString()
        } catch (err) {
          require('console').error(`Invalid action entry ${item}`, err)
          throw err
        }
      }
      for (const item in referenceManifest.edge) {
        try {
          const itemInfo = referenceManifest.edge[item]

          foundExportNames.push(itemInfo.exportedName)

          expect(itemInfo.filename).toBeString()
          expect(itemInfo.exportedName).toBeString()
        } catch (err) {
          require('console').error(`Invalid action entry ${item}`, err)
          throw err
        }
      }

      expect(foundExportNames).toContain('setCookie')
      expect(foundExportNames).toContain('getCookie')
      expect(foundExportNames).toContain('getHeader')
      expect(foundExportNames).toContain('setCookieWithMaxAge')
    })
  }

  it('should handle action correctly with middleware rewrite', async () => {
    const browser = await next.browser('/rewrite-to-static-first')
    let actionRequestStatus: number | undefined

    browser.on('response', async (res) => {
      if (
        res.url().includes('rewrite-to-static-first') &&
        res.request().method() === 'POST'
      ) {
        actionRequestStatus = res.status()
      }
    })
    await browser.elementByCss('#inc').click()

    await retry(async () => {
      expect(Number(await browser.elementByCss('#count').text())).toBe(1)
    })

    expect(actionRequestStatus).toBe(200)
  })

  it('should handle basic actions correctly', async () => {
    const browser = await next.browser('/server')

    const cnt = await browser.elementById('count').text()
    expect(cnt).toBe('0')

    await browser.elementByCss('#inc').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('1')
    })

    await browser.elementByCss('#inc').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('2')
    })
    await browser.elementByCss('#double').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('4')
    })

    await browser.elementByCss('#dec').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('3')
    })
  })

  it('should report errors with bad inputs correctly', async () => {
    const browser = await next.browser('/error-handling', {
      pushErrorAsConsoleLog: true,
    })

    await browser.elementByCss('#submit').click()

    await retry(async () => {
      const logs = await browser.log()

      expect(logs).toMatchObject(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(
              isNextDev
                ? 'Cannot access value on the server.'
                : GENERIC_RSC_ERROR.replace(/^Error: /, '')
            ),
          }),
        ])
      )
    })
  })

  it('should propagate errors from a `text/plain` response to an error boundary', async () => {
    const customErrorText = 'Custom error!'
    const browser = await next.browser('/error-handling', {
      beforePageLoad(page) {
        page.route('**/error-handling', async (route) => {
          const requestHeaders = await route.request().allHeaders()
          if (requestHeaders['next-action']) {
            await route.fulfill({
              status: 500,
              contentType: 'text/plain',
              body: customErrorText,
            })
          } else {
            await route.continue()
          }
        })
      },
    })

    await browser.elementById('submit-transition').click()
    const error = await browser.waitForElementByCss('#error-text')
    expect(await error.text()).toBe(customErrorText)
  })

  it('should trigger an error boundary for action responses with an invalid content-type', async () => {
    const customErrorText = 'Custom error!'
    const browser = await next.browser('/error-handling', {
      beforePageLoad(page) {
        page.route('**/error-handling', async (route) => {
          const requestHeaders = await route.request().allHeaders()
          if (requestHeaders['next-action']) {
            await route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: customErrorText }),
            })
          } else {
            await route.continue()
          }
        })
      },
    })

    await browser.elementById('submit-transition').click()
    const error = await browser.waitForElementByCss('#error-text')
    expect(await error.text()).toBe(
      'An unexpected response was received from the server.'
    )
  })

  it('should support headers and cookies', async () => {
    const browser = await next.browser('/header')

    await browser.elementByCss('#cookie').click()
    await retry(async () => {
      const res = await browser.elementByCss('h1', { state: 'attached' }).text()
      const id = res.split(':', 2)
      expect(id[0]).toBeDefined()
      expect(id[0]).toBe(id[1])
    })

    await browser.elementByCss('#header').click()
    await retry(async () => {
      const res = await browser.elementByCss('h1').text()
      expect(res).toContain('Mozilla')
    })

    // Set cookies
    await browser.elementByCss('#setCookie').click()
    await retry(async () => {
      const res = await browser.elementByCss('h1').text()
      const id = res.split(':', 3)

      expect(id[0]).toBeDefined()
      expect(id[0]).toBe(id[1])
      expect(id[0]).toBe(id[2])
    })
  })

  it.each([
    { description: 'with javascript', disableJavaScript: false },
    { description: 'no javascript', disableJavaScript: true },
  ])(
    'should support setting cookies when redirecting ($description)',
    async ({ disableJavaScript }) => {
      const browser = await next.browser('/mutate-cookie-with-redirect', {
        disableJavaScript,
      })
      expect(await browser.elementByCss('#value').text()).toBe('<null>')

      await browser.elementByCss('#update-cookie').click()
      await browser.elementByCss('#redirect-target')

      expect(await browser.elementByCss('#value').text()).toMatch(/\d+/)
      expect(await browser.eval('document.cookie')).toMatch(
        /(?:^|(?:; ))testCookie=\d+/
      )
    }
  )

  it('should push new route when redirecting', async () => {
    const browser = await next.browser('/header')

    await browser.elementByCss('#setCookieAndRedirect').click()
    await retry(async () => {
      expect(await browser.elementByCss('#redirected').text()).toBe(
        'redirected'
      )
    })

    // Ensure we can navigate back
    await browser.back()

    await retry(async () => {
      expect(await browser.elementByCss('#setCookieAndRedirect').text()).toBe(
        'setCookieAndRedirect'
      )
    })
  })

  it('should replace current route when redirecting with type set to replace', async () => {
    const browser = await next.browser('/header')

    let historyLen = await browser.eval('window.history.length')
    // chromium's about:blank page is the first item in history
    expect(historyLen).toBe(2)

    await browser.elementByCss('#setCookieAndRedirectReplace').click()
    await retry(async () => {
      expect(await browser.elementByCss('#redirected').text()).toBe(
        'redirected'
      )
    })

    // Ensure we cannot navigate back
    historyLen = await browser.eval('window.history.length')
    // chromium's about:blank page is the first item in history
    expect(historyLen).toBe(2)
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
      await retry(() => {
        expect(
          logs.some((log) => log.includes('accept header: text/x-component'))
        ).toBe(true)
      })
    }

    await retry(async () => {
      const cookie = await browser.eval('document.cookie')
      expect(cookie).toContain('test-cookie')
    })

    expect(
      await browser.eval('+document.cookie.match(/test-cookie=(\\d+)/)[1]')
    ).toBeGreaterThanOrEqual(currentTimestamp)
  })

  it('should not log errors for non-action form POSTs', async () => {
    const logs: string[] = []
    next.on('stdout', (log) => {
      logs.push(log)
    })
    next.on('stderr', (log) => {
      logs.push(log)
    })

    const browser = await next.browser('/non-action-form')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}/`)
    })

    // we don't have access to runtime logs on deploy
    if (!isNextDeploy) {
      await retry(() => {
        expect(
          logs.some((log) =>
            log.includes('Failed to find Server Action "null"')
          )
        ).toBe(false)
      })
    }
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

    await retry(async () => {
      expect(await browser.url()).toBe(
        `${next.url}/header?name=test&hidden-info=hi`
      )
    })
  })

  it('should support .bind', async () => {
    const browser = await next.browser('/server')

    await browser.eval(`document.getElementById('n').value = '123'`)
    await browser.elementByCss('#minus-one').click()

    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}/header?result=122`)
    })
  })

  it('should support chained .bind', async () => {
    const browser = await next.browser('/server')

    await browser.elementByCss('#add3').click()

    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}/header?result=6`)
    })
  })

  it('should support notFound (javascript disabled)', async () => {
    const browser = await next.browser('/server', {
      // TODO we should also test this with javascript on but not-found is not implemented yet.
      disableJavaScript: true,
    })

    await browser.elementByCss('#nowhere').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('my-not-found')
    })
  })

  it('should support notFound', async () => {
    const browser = await next.browser('/server')

    await browser.elementByCss('#nowhere').click()

    // Until not-found page is resolved
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('my-not-found')
    })

    // Should have default noindex meta tag
    expect(
      await browser.elementByCss('meta[name="robots"]').getAttribute('content')
    ).toBe('noindex')
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
      const file = new File(['hello'], 'hello你好テスト.txt', { type: 'text/plain' });
      const list = new DataTransfer();
      list.items.add(file);
      document.getElementById('file').files = list.files;
    `)

    await browser.elementByCss('#upload').click()

    // we don't have access to runtime logs on deploy
    if (!isNextDeploy) {
      await retry(() => {
        expect(
          logs.some((log) =>
            log.includes('File name: hello你好テスト.txt size: 5')
          )
        ).toBe(true)
      })
    }
  })

  it('should support hoc auth wrappers', async () => {
    const browser = await next.browser('/header')
    await browser.eval(`document.cookie = 'auth=0'`)

    await browser.elementByCss('#authed').click()

    await retry(async () => {
      if (isNextDev) {
        expect(await browser.elementByCss('h1').text()).toBe(
          'Error: Unauthorized request'
        )
      } else {
        expect(await browser.elementByCss('h1').text()).toBe(GENERIC_RSC_ERROR)
      }
    })

    await browser.eval(`document.cookie = 'auth=1'`)

    await browser.elementByCss('#authed').click()

    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe(
        'Prefix: HELLO, WORLD'
      )
    })
  })

  it('should support importing actions in client components', async () => {
    const browser = await next.browser('/client')

    const cnt = await browser.elementById('count').text()
    expect(cnt).toBe('0')

    await browser.elementByCss('#inc').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('1')
    })

    await browser.elementByCss('#inc').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('2')
    })

    await browser.elementByCss('#double').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('4')
    })
    await browser.elementByCss('#dec').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('3')
    })
  })

  it('should support importing the same action module instance in both server and action layers', async () => {
    const browser = await next.browser('/shared')

    const v = await browser.elementByCss('#value').text()
    expect(v).toBe('Value = 0')

    await browser.elementByCss('#server-inc').click()
    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('Value = 1')
    })

    await browser.elementByCss('#client-inc').click()
    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe('Value = 2')
    })
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

  it('should not block router.back() while a server action is in flight', async () => {
    let browser = await next.browser('/')

    // click /client link to add a history entry
    await browser.elementByCss("[href='/client']").click()
    await browser.elementByCss('#slow-inc').click()

    await browser.back()

    // intentionally bailing after 2 retries so we don't retry to the point where the async function resolves
    await check(() => browser.url(), `${next.url}/`, true, 2)
  })

  it('should trigger a refresh for a server action that also dispatches a navigation event', async () => {
    let browser = await next.browser('/revalidate')
    let initialJustPutit = await browser.elementById('justputit').text()

    // this triggers a revalidate + redirect in a client component
    await browser.elementById('redirect-revalidate-client').click()
    await retry(async () => {
      expect(await browser.url()).toBe(`${next.url}/revalidate?foo=bar`)

      const newJustPutIt = await browser.elementById('justputit').text()
      expect(newJustPutIt).not.toBe(initialJustPutit)
    })

    // this triggers a revalidate + redirect in a server component
    browser = await next.browser('/revalidate')
    initialJustPutit = await browser.elementById('justputit').text()
    await browser.elementById('redirect-revalidate').click()
    await retry(async () => {
      const newJustPutIt = await browser.elementById('justputit').text()
      expect(newJustPutIt).not.toBe(initialJustPutit)

      expect(await browser.url()).toBe(`${next.url}/revalidate?foo=bar`)
    })
  })

  it('should support next/dynamic with ssr: false', async () => {
    const browser = await next.browser('/dynamic-csr')

    await retry(async () => {
      expect(await browser.elementByCss('button').text()).toBe('0')
    })

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('button').text()).toBe('1')
    })
  })

  it('should support next/dynamic with ssr: false (edge)', async () => {
    const browser = await next.browser('/dynamic-csr/edge')

    await retry(async () => {
      expect(await browser.elementByCss('button').text()).toBe('0')
    })

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('button').text()).toBe('1')
    })
  })

  it('should only submit action once when resubmitting an action after navigation', async () => {
    let requestCount = 0

    const browser = await next.browser('/server', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          const url = new URL(request.url())
          // Only count POST requests to /server (form submissions)
          if (url.pathname === '/server' && request.method() === 'POST') {
            requestCount++
          }
        })
      },
    })

    async function submitForm() {
      await browser.elementById('name').type('foo')
      await browser.elementById('submit').click()
      await retry(async () => {
        expect(await browser.url()).toContain('/header')
      })
    }

    await submitForm()

    await browser.elementById('navigate-server').click()
    await retry(async () => {
      expect(await browser.url()).toContain('/server')
    })
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

    expect(await browser.elementByCss('h1').text()).toBe('Transition is: idle')

    // The initial page request shouldn't count towards the request count.
    requestCount = 0

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

    // each action takes 1 second,
    // so we override the default retry interval to 1 second
    // and duration to 6 seconds to allow for all actions to complete
    await retry(
      async () => {
        expect(await browser.elementByCss('h1').text()).toBe(
          'Transition is: idle'
        )
        expect(requestCount).toBe(6)
      },
      6000,
      1000
    )
  })

  it('should reset the form state when the action redirects to a page that contains the same form', async () => {
    const browser = await next.browser('/redirect')
    const input = await browser.elementByCss('input[name="name"]')
    const submit = await browser.elementByCss('button')

    expect(await browser.hasElementByCssSelector('#error')).toBe(false)

    await input.fill('foo')
    await submit.click()

    // The server action will fail validation and will return error state
    // verify that the error state is displayed
    await retry(async () => {
      expect(await browser.hasElementByCssSelector('#error')).toBe(true)
      expect(await browser.elementByCss('#error').text()).toBe(
        "Only 'justputit' is accepted."
      )
    })

    // The server action won't return an error state, it will just call redirect to itself
    // Validate that the form state is reset
    await input.fill('justputit')
    await submit.click()

    await retry(async () => {
      expect(await browser.hasElementByCssSelector('#error')).toBe(false)
    })
  })

  it('should invalidate the client router cache if the redirect action triggers a revalidation', async () => {
    const browser = await next.browser('/redirect')
    const input = await browser.elementByCss('input[name="name"]')
    const revalidateCheckbox = await browser.elementByCss(
      'input[name="revalidate"]'
    )
    const submit = await browser.elementByCss('button')
    const initialRandom = await browser.elementById('random-number').text()
    expect(initialRandom).toMatch(/\d+/)

    expect(await browser.hasElementByCssSelector('#error')).toBe(false)

    await input.fill('justputit')
    await revalidateCheckbox.check()
    await submit.click()

    await retry(async () => {
      expect(await browser.hasElementByCssSelector('#error')).toBe(false)
    })

    // go back to the page that was revalidated
    await browser.elementByCss('[href="/redirect"]').click()

    await browser.waitForElementByCss('#main-page')

    const newRandom = await browser.elementById('random-number').text()
    expect(newRandom).not.toBe(initialRandom)
  })

  // TODO(client-segment-cache): re-enable when this optimization is added back
  it.skip('should reset the form state when the action redirects to itself', async () => {
    const browser = await next.browser('/self-redirect')
    const requests = []
    browser.on('request', async (req) => {
      const url = new URL(req.url())

      if (url.pathname === '/self-redirect') {
        const headers = await req.allHeaders()
        if (headers['rsc']) {
          requests.push(req)
        }
      }
    })

    const input = await browser.elementByCss('input[name="name"]')
    const submit = await browser.elementByCss('button')

    expect(await browser.hasElementByCssSelector('#error')).toBe(false)

    await input.fill('foo')
    await submit.click()

    // The server action will fail validation and will return error state
    // verify that the error state is displayed
    await retry(async () => {
      expect(await browser.hasElementByCssSelector('#error')).toBe(true)
      expect(await browser.elementByCss('#error').text()).toBe(
        "Only 'justputit' is accepted."
      )
    })

    // The server action won't return an error state, it will just call redirect to itself
    // Validate that the form state is reset
    await input.fill('justputit')
    await submit.click()

    await retry(async () => {
      expect(await browser.hasElementByCssSelector('#error')).toBe(false)
    })

    // This verifies the redirect & server response happens in a single roundtrip,
    // if the redirect resource was static. In development, these responses are always
    // dynamically generated, so we only expect a single request for build/deploy.
    if (!isNextDev) {
      expect(requests.length).toBe(0)
    }
  })

  it('should be possible to catch network errors', async () => {
    const browser = await next.browser('/catching-error', {
      beforePageLoad(page) {
        page.route('**/catching-error', (route) => {
          if (route.request().method() !== 'POST') {
            route.fallback()
            return
          }

          route.abort('internetdisconnected')
        })
      },
    })

    await browser.elementById('good-action').click()

    // verify that the app didn't crash after the error was thrown
    expect(await browser.elementById('submitted-msg').text()).toBe('Submitted!')

    // Verify that the catch log was printed
    const logs = await browser.log()
    expect(
      logs.some((log) => log.message === 'error caught in user code')
    ).toBe(true)
  })

  it('should be possible to catch regular errors', async () => {
    const browser = await next.browser('/catching-error')

    await browser.elementById('bad-action').click()

    // verify that the app didn't crash after the error was thrown
    expect(await browser.elementById('submitted-msg').text()).toBe('Submitted!')

    // Verify that the catch log was printed
    const logs = await browser.log()
    expect(
      logs.some((log) => log.message === 'error caught in user code')
    ).toBe(true)
  })

  // we don't have access to runtime logs on deploy
  if (!isNextDeploy) {
    it('should keep action instances identical', async () => {
      const logs: string[] = []
      next.on('stdout', (log) => {
        logs.push(log)
      })

      const browser = await next.browser('/identity')

      await browser.elementByCss('button').click()

      await retry(() => {
        expect(logs.join('')).toContain('result: true')
      })
    })
  }

  it.each(['node', 'edge'])(
    'should forward action request to a worker that contains the action handler (%s)',
    async (runtime) => {
      const cliOutputIndex = next.cliOutput.length
      const browser = await next.browser(`/delayed-action/${runtime}`)

      // confirm there's no data yet
      expect(await browser.elementById('delayed-action-result').text()).toBe(
        '<null>'
      )

      // Trigger the delayed action. This will sleep for a few seconds before dispatching the server action handler
      await browser.elementById('run-action').click()

      // navigate away from the page
      await browser
        .elementByCss(`[href='/delayed-action/${runtime}/other']`)
        .click()

      await browser.waitForElementByCss('#other-page')

      await retry(async () => {
        expect(
          await browser.elementById('delayed-action-result').text()
        ).toMatch(
          // matches a Math.random() string
          /0\.\d+/
        )
      })

      // make sure that we still are rendering other-page content
      expect(await browser.hasElementByCssSelector('#other-page')).toBe(true)

      // make sure we didn't get any errors in the console
      expect(next.cliOutput.slice(cliOutputIndex)).not.toContain(
        'Failed to find Server Action'
      )
    }
  )

  it.each(['node', 'edge'])(
    'should not error when a forwarded action triggers a redirect (%s)',
    async (runtime) => {
      let redirectResponseCode
      const browser = await next.browser(`/delayed-action/${runtime}`, {
        beforePageLoad(page) {
          page.on('response', async (res) => {
            const headers = await res.allHeaders().catch(() => ({}))
            if (headers['x-action-redirect']) {
              redirectResponseCode = res.status()
            }
          })
        },
      })

      // Trigger the delayed action. This will sleep for a few seconds before dispatching the server action handler
      await browser.elementById('run-action-redirect').click()

      // navigate away from the page
      await browser
        .elementByCss(`[href='/delayed-action/${runtime}/other']`)
        .click()
        .waitForElementByCss('#other-page')

      // confirm a successful response code on the redirected action
      await retry(async () => {
        expect(redirectResponseCode).toBe(200)
      })

      // confirm that the redirect was handled
      await browser.waitForElementByCss('#run-action-redirect')
    }
  )

  if (isNextStart) {
    it('should not expose action content in sourcemaps', async () => {
      // We check all sourcemaps in the `static` folder for sensitive information given that chunking
      const sourcemaps = await fs
        .readdir(join(next.testDir, getDistDir(), 'static'), {
          recursive: true,
          encoding: 'utf8',
        })
        .then((files) =>
          Promise.all(
            files
              .filter((f) => f.endsWith('.js.map'))
              .map((f) =>
                fs.readFile(join(next.testDir, getDistDir(), 'static', f), {
                  encoding: 'utf8',
                })
              )
          )
        )

      expect(sourcemaps).not.toBeEmpty()

      for (const sourcemap of sourcemaps) {
        expect(sourcemap).not.toContain('this_is_sensitive_info')
      }
    })
  }

  if (isNextDev) {
    describe('"use server" export values', () => {
      it('should error when exporting non async functions at build time', async () => {
        const filePath = 'app/server/actions.js'
        const origContent = await next.readFile(filePath)

        try {
          const browser = await next.browser('/server')

          const cnt = await browser.elementByCss('h1').text()
          expect(cnt).toBe('0')

          // This can be caught by SWC directly
          await next.patchFile(
            filePath,
            origContent + '\n\nexport const foo = 1'
          )

          await assertHasRedbox(browser)
          expect(await getRedboxSource(browser)).toContain(
            'Only async functions are allowed to be exported in a "use server" file.'
          )
        } finally {
          await next.patchFile(filePath, origContent)
        }
      })
    })

    describe('HMR', () => {
      it('should support updating the action', async () => {
        const filePath = 'app/server/actions-3.js'
        const origContent = await next.readFile(filePath)

        try {
          const browser = await next.browser('/server')

          const cnt = await browser.elementById('count').text()
          expect(cnt).toBe('0')

          await browser.elementByCss('#inc').click()
          await retry(async () => {
            expect(await browser.elementById('count').text()).toBe('1')
          })

          await next.patchFile(
            filePath,
            origContent.replace('return value + 1', 'return value + 1000')
          )

          await retry(async () => {
            await browser.elementByCss('#inc').click()
            const val = Number(await browser.elementById('count').text())
            expect(val).toBeGreaterThan(1000)
          })
        } finally {
          await next.patchFile(filePath, origContent)
        }
      })
    })

    it('should bundle external libraries if they are on the action layer', async () => {
      await next.fetch('/client')
      const pageBundle = await fs.readFile(
        join(next.testDir, getDistDir(), 'server', 'app', 'client', 'page.js'),
        { encoding: 'utf8' }
      )
      if (isTurbopack) {
        const chunkPaths = pageBundle.matchAll(/R\.c\("([^"]*)"\)/g)
        const reads = [...chunkPaths].map(async (match) => {
          const bundle = await fs.readFile(
            join(next.testDir, getDistDir(), ...match[1].split(/[\\/]/g)),
            { encoding: 'utf8' }
          )
          return bundle.includes('node_modules/nanoid/index.js')
        })

        expect(await Promise.all(reads)).toContain(true)
      } else {
        expect(pageBundle).toContain('node_modules/nanoid/index.js')
      }
    })
  }

  describe('Edge SSR', () => {
    it('should handle basic actions correctly', async () => {
      const browser = await next.browser('/server/edge')

      const cnt = await browser.elementById('count').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('1')
      })

      await browser.elementByCss('#inc').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('2')
      })
      await browser.elementByCss('#double').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('4')
      })
      await browser.elementByCss('#dec').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('3')
      })
    })

    it('should return error response for hoc auth wrappers in edge runtime', async () => {
      const browser = await next.browser('/header/edge')
      await await browser.eval(`document.cookie = 'edge-auth=0'`)

      await browser.elementByCss('#authed').click()

      await retry(async () => {
        const text = await browser.elementByCss('h1').text()
        if (isNextDev) {
          expect(text).toBe('Error: Unauthorized request')
        } else {
          expect(text).toBe(GENERIC_RSC_ERROR)
        }
      })

      await browser.eval(`document.cookie = 'edge-auth=1'`)

      await browser.elementByCss('#authed').click()

      await retry(async () => {
        expect(await browser.elementByCss('h1').text()).toBe(
          'Prefix: HELLO, WORLD'
        )
      })
    })

    it.each(['relative', 'absolute'])(
      `should handle calls to redirect() with a %s URL in a single pass`,
      async (redirectType) => {
        const initialPagePath = '/client/redirects'
        const destinationPagePath = '/redirect-target'

        const browser = await next.browser(initialPagePath)

        const requests: Request[] = []
        const responses: Response[] = []

        browser.on('request', (req) => {
          const url = req.url()

          if (
            url.includes(initialPagePath) ||
            url.includes(destinationPagePath)
          ) {
            requests.push(req)
          }
        })

        browser.on('response', (res) => {
          const url = res.url()

          if (
            url.includes(initialPagePath) ||
            url.includes(destinationPagePath)
          ) {
            responses.push(res)
          }
        })

        await browser.elementById(`redirect-${redirectType}`).click()
        await retry(async () => {
          expect(await browser.url()).toBe(`${next.url}${destinationPagePath}`)
        })

        expect(await browser.waitForElementByCss('#redirected').text()).toBe(
          'redirected'
        )

        // This verifies the redirect & server response happens in a single roundtrip,
        // if the redirect resource was static. In development, these responses are always
        // dynamically generated, so we only expect a single request for build/deploy.
        if (!isNextDev) {
          expect(requests).toHaveLength(1)
          expect(responses).toHaveLength(1)
        }

        const request = requests[0]
        const response = responses[0]

        expect(request.url()).toEqual(`${next.url}${initialPagePath}`)
        expect(request.method()).toEqual('POST')
        expect(response.status()).toEqual(303)
      }
    )

    it('should handle calls to redirect() with external URLs', async () => {
      const browser = await next.browser('/client/redirects')

      await browser.elementByCss('#redirect-external').click()

      await retry(async () => {
        expect(await browser.url()).toBe(
          'https://next-data-api-endpoint.vercel.app/api/random?page'
        )
      })
    })

    it('should allow cookie and header async storages', async () => {
      const browser = await next.browser('/client/edge')

      const currentTestCookie = await browser.eval(
        `document.cookie.match(/test-cookie=(\\d+)/)?.[1]`
      )

      await browser.elementByCss('#get-headers').click()

      await retry(async () => {
        const newTestCookie = await browser.eval(
          `document.cookie.match(/test-cookie=(\\d+)/)?.[1]`
        )
        expect(newTestCookie).not.toBe(currentTestCookie)
      })
    })

    it('should handle unicode search params', async () => {
      const browser = await next.browser('/server?name=名')

      const cnt = await browser.elementById('count').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('1')
      })
    })
  })

  describe('fetch actions', () => {
    it('should handle a fetch action initiated from a static page', async () => {
      const browser = await next.browser('/client-static')
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('0')
      })
      await browser.elementByCss('#increment').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('1')
      })
      await browser.elementByCss('#increment').click()
      await retry(async () => {
        expect(await browser.elementById('count').text()).toBe('2')
      })
    })

    it.each(['relative', 'absolute'])(
      `should handle calls to redirect() with a %s URL in a single pass`,
      async (redirectType) => {
        const initialPagePath = '/client/redirects'
        const destinationPagePath = '/redirect-target'

        const browser = await next.browser(initialPagePath)

        const requests: Request[] = []
        const responses: Response[] = []

        browser.on('request', (req) => {
          const url = req.url()

          if (
            url.includes(initialPagePath) ||
            url.includes(destinationPagePath)
          ) {
            requests.push(req)
          }
        })

        browser.on('response', (res) => {
          const url = res.url()

          if (
            url.includes(initialPagePath) ||
            url.includes(destinationPagePath)
          ) {
            responses.push(res)
          }
        })

        await browser.elementById(`redirect-${redirectType}`).click()
        await retry(async () => {
          expect(await browser.url()).toBe(`${next.url}${destinationPagePath}`)
        })

        // This verifies the redirect & server response happens in a single roundtrip,
        // if the redirect resource was static. In development, these responses are always
        // dynamically generated, so we only expect a single request for build/deploy.
        if (!isNextDev) {
          expect(requests).toHaveLength(1)
          expect(responses).toHaveLength(1)
        }

        const request = requests[0]
        const response = responses[0]

        expect(request.url()).toEqual(`${next.url}${initialPagePath}`)
        expect(request.method()).toEqual('POST')
        expect(response.status()).toEqual(303)
      }
    )

    it('should handle calls to redirect() with external URLs', async () => {
      const browser = await next.browser('/client/redirects')

      await browser.elementByCss('#redirect-external').click()

      await retry(async () => {
        expect(await browser.url()).toBe(
          'https://next-data-api-endpoint.vercel.app/api/random?page'
        )
      })
    })

    it('should handle redirects to routes that provide an invalid RSC response', async () => {
      let mpaTriggered = false
      const browser = await next.browser('/client', {
        beforePageLoad(page) {
          page.on('framenavigated', () => {
            mpaTriggered = true
          })
        },
      })

      await browser.elementByCss('#redirect-pages').click()

      await retry(async () => {
        expect(await browser.elementByCss('body').text()).toContain(
          'Hello from a pages route'
        )
        expect(await browser.url()).toBe(`${next.url}/pages-dir`)
        expect(mpaTriggered).toBe(true)
      }, 5000)
    })

    it('should handle revalidatePath', async () => {
      const browser = await next.browser('/revalidate')
      const randomNumber = await browser.elementByCss('#random-number').text()
      const justPutIt = await browser.elementByCss('#justputit').text()
      const thankYouNext = await browser.elementByCss('#thankyounext').text()

      await browser.elementByCss('#revalidate-path').click()

      await retry(async () => {
        const newRandomNumber = await browser
          .elementByCss('#random-number')
          .text()
        const newJustPutIt = await browser.elementByCss('#justputit').text()
        const newThankYouNext = await browser
          .elementByCss('#thankyounext')
          .text()

        expect(newRandomNumber).not.toBe(randomNumber)
        expect(newJustPutIt).not.toBe(justPutIt)
        expect(newThankYouNext).not.toBe(thankYouNext)
      })
    })

    it('should handle revalidateTag', async () => {
      const browser = await next.browser('/revalidate')
      const randomNumber = await browser.elementByCss('#random-number').text()
      const justPutIt = await browser.elementByCss('#justputit').text()
      const thankYouNext = await browser.elementByCss('#thankyounext').text()

      await browser.elementByCss('#revalidate-justputit').click()

      await retry(async () => {
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
      })
    })

    // TODO: investigate flakey behavior with revalidate
    it.skip('should handle revalidateTag + redirect', async () => {
      const browser = await next.browser('/revalidate')
      const randomNumber = await browser.elementByCss('#random-number').text()
      const justPutIt = await browser.elementByCss('#justputit').text()
      const thankYouNext = await browser.elementByCss('#thankyounext').text()

      await browser.elementByCss('#revalidate-path-redirect').click()

      await retry(async () => {
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
      })
    })

    it('should store revalidation data in the prefetch cache', async () => {
      const browser = await next.browser('/revalidate')
      const justPutIt = await browser.elementByCss('#justputit').text()
      await browser.elementByCss('#revalidate-justputit').click()

      await retry(async () => {
        const newJustPutIt = await browser.elementByCss('#justputit').text()
        expect(newJustPutIt).not.toBe(justPutIt)
      })

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
      const randomNumber = await browser
        .elementByCss('#random-cookie', { state: 'attached' })
        .text()

      await browser.elementByCss('#set-cookie').click()

      await retry(async () => {
        const newRandomNumber = await browser
          .elementByCss('#random-cookie')
          .text()

        expect(newRandomNumber).not.toBe(randomNumber)
      })
    })

    it('should invalidate client cache on other routes when cookies.set is called', async () => {
      const browser = await next.browser('/mutate-cookie')
      await browser.elementByCss('#update-cookie').click()

      let cookie
      await retry(async () => {
        cookie = await browser.elementByCss('#value').text()
        expect(parseInt(cookie)).toBeGreaterThan(0)
      })

      // Make sure the route is cached
      await browser.elementByCss('#page-2').click()
      await browser.elementByCss('#back').click()

      // Modify the cookie
      await browser.elementByCss('#update-cookie').click()
      let newCookie
      await retry(async () => {
        newCookie = await browser.elementByCss('#value').text()
        expect(newCookie).not.toBe(cookie)
        expect(parseInt(newCookie)).toBeGreaterThan(0)
      })

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
      await retry(async () => {
        randomCookie = JSON.parse(
          await browser.elementByCss('#random-cookie').text()
        ).cookie.value
      })

      await browser.elementByCss('#another').click()
      await retry(async () => {
        expect(await browser.elementByCss('#title').text()).toBe(
          'another route'
        )
      })

      const newRandomCookie = JSON.parse(
        await browser.elementByCss('#random-cookie').text()
      ).cookie.value

      console.log(456, await browser.elementByCss('body').text())

      // Should be the same value
      expect(randomCookie).toEqual(newRandomCookie)

      await browser.elementByCss('#back').click()

      // Modify the cookie
      await browser.elementByCss('#set-cookie').click()

      // Should be different
      let revalidatedRandomCookie
      await retry(async () => {
        revalidatedRandomCookie = JSON.parse(
          await browser.elementByCss('#random-cookie').text()
        ).cookie.value
        expect(revalidatedRandomCookie).not.toBe(randomCookie)
      })

      await browser.elementByCss('#another').click()

      // The other page should be revalidated too
      await retry(async () => {
        const newRandomCookie = await JSON.parse(
          await browser.elementByCss('#random-cookie').text()
        ).cookie.value
        expect(revalidatedRandomCookie).toBe(newRandomCookie)
      })
    })

    it.each(['tag', 'path'])(
      'should invalidate client cache when %s is revalidated',
      async (type) => {
        const browser = await next.browser('/revalidate')
        await browser.refresh()

        const original = await browser.elementByCss('#thankyounext').text()

        await browser.elementByCss('#another').click()
        await retry(async () => {
          expect(await browser.elementByCss('#title').text()).toBe(
            'another route'
          )
        })

        await retry(async () => {
          const another = await browser.elementByCss('#thankyounext').text()
          expect(another).toEqual(original)
        })

        await browser.elementByCss('#back').click()
        await retry(async () => {
          expect(await browser.elementByCss('#title').text()).toBe('revalidate')
        })

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

        // Should be different
        let revalidated
        await retry(async () => {
          revalidated = await browser.elementByCss('#thankyounext').text()
          expect(revalidated).not.toBe(original)
        })

        await browser.elementByCss('#another').click()
        await retry(async () => {
          expect(await browser.elementByCss('#title').text()).toBe(
            'another route'
          )
        })

        // The other page should be revalidated too
        await retry(async () => {
          const another = await browser.elementByCss('#thankyounext').text()
          expect(another).toBe(revalidated)
        })
      }
    )
  })

  it('should work with interception routes', async () => {
    const browser = await next.browser('/interception-routes')

    await retry(async () => {
      expect(await browser.elementById('children-data').text()).toContain(
        'Open modal'
      )
    })

    await browser.elementByCss("[href='/interception-routes/test']").click()

    await retry(async () => {
      // verify the URL is correct
      expect(await browser.url()).toContain('interception-routes/test')
      // the intercepted text should appear
      expect(await browser.elementById('modal-data').text()).toContain(
        'in "modal"'
      )
    })

    // Submit the action
    await browser.elementById('submit-intercept-action').click()
    let responseElement = await browser.waitForElementByCss(
      '#submit-intercept-action-response'
    )

    expect(await responseElement.text()).toBe('Action Submitted (Intercepted)')

    await browser.refresh()

    // the modal text should be gone
    expect(await browser.hasElementByCssSelector('#modal-data')).toBeFalsy()

    // The page text should show
    await retry(async () => {
      expect(await browser.elementById('children-data').text()).toContain(
        'in "page"'
      )
    })

    // Submit the action
    await browser.elementById('submit-page-action').click()

    responseElement = await browser.waitForElementByCss(
      '#submit-page-action-response'
    )

    expect(await responseElement.text()).toBe('Action Submitted (Page)')
  })

  describe('encryption', () => {
    it('should send encrypted values from the closed over closure', async () => {
      const res = await next.fetch('/encryption')
      const html = await res.text()
      expect(html).not.toContain('qwerty123')
      expect(html).not.toContain('some-module-level-encryption-value')
    })

    it('should be able to resolve other server actions and client components', async () => {
      const browser = await next.browser('/encryption')
      expect(await browser.elementByCss('p').text()).toBe('initial')
      await browser.elementByCss('button').click()

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe('hello from client')
      })
    })
  })

  describe('redirects', () => {
    it('redirects properly when route handler uses `redirect`', async () => {
      const postRequests = []
      const responseCodes = []

      const browser = await next.browser('/redirects', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (request.method() === 'POST') {
              postRequests.push(url.pathname)
            }
          })

          page.on('response', (response) => {
            const url = new URL(response.url())
            const status = response.status()

            if (postRequests.includes(`${url.pathname}${url.search}`)) {
              responseCodes.push(status)
            }
          })
        },
      })
      await browser.elementById('submit-api-redirect').click()
      // await check(() => browser.url(), /success=true/)
      await retry(async () => {
        expect(await browser.url()).toContain('success=true')
      })

      // verify that the POST request was only made to the route handler
      expect(postRequests).toEqual(['/redirects/api-redirect'])
      expect(responseCodes).toEqual([303])
    })

    it('redirects properly when route handler uses `permanentRedirect`', async () => {
      const postRequests = []
      const responseCodes = []

      const browser = await next.browser('/redirects', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url())
            if (request.method() === 'POST') {
              postRequests.push(url.pathname)
            }
          })

          page.on('response', (response) => {
            const url = new URL(response.url())
            const status = response.status()

            if (postRequests.includes(`${url.pathname}${url.search}`)) {
              responseCodes.push(status)
            }
          })
        },
      })

      await browser.elementById('submit-api-redirect-permanent').click()
      await retry(async () => {
        expect(await browser.url()).toContain('success=true')
      })
      // verify that the POST request was only made to the route handler
      expect(postRequests).toEqual(['/redirects/api-redirect-permanent'])
      expect(responseCodes).toEqual([303])
    })

    it('displays searchParams correctly when redirecting with SearchParams', async () => {
      const browser = await next.browser('/redirects/action-redirect')
      await browser.refresh()
      expect(await browser.elementByCss('h2').text()).toBe('baz=')

      // redirect with search params
      await browser.elementById('redirect-with-search-params').click()

      await retry(async () => {
        expect(await browser.url()).toMatch(
          /\/redirects\/action-redirect\/redirect-target\?baz=1/
        )
      })

      // verify that the search params was set correctly
      expect(await browser.elementByCss('h2').text()).toBe('baz=1')
    })

    it('merges cookies correctly when redirecting', async () => {
      const browser = await next.browser('/redirects/action-redirect')

      // set foo and bar to be both 1, and verify
      await browser.eval(
        `document.cookie = 'bar=1; Path=/'; document.cookie = 'foo=1; Path=/';`
      )
      await browser.refresh()
      expect(await browser.elementByCss('h1').text()).toBe('foo=1; bar=1')

      // delete foo and set bar to 2, redirect
      await browser.elementById('redirect-with-cookie-mutation').click()

      await retry(async () => {
        expect(await browser.url()).toMatch(
          /\/redirects\/action-redirect\/redirect-target/
        )
      })

      // verify that the cookies were merged correctly
      expect(await browser.elementByCss('h1').text()).toBe('foo=; bar=2')
    })

    it('should not forward next-action header to a redirected RSC request', async () => {
      const browser = await next.browser('/redirects/action-redirect')

      await browser.elementById('redirect-with-search-params').click()
      await retry(async () => {
        expect(await browser.url()).toMatch(
          /\/redirects\/action-redirect\/redirect-target\?baz=1/
        )
      })
      // verify that the search params was set correctly
      expect(await browser.elementByCss('h2').text()).toBe('baz=1')

      // we should not have the next-action header in the redirected request
      expect(next.cliOutput).not.toContain(
        'Action header should not be present'
      )
    })

    it.each(['307', '308'])(
      `redirects properly when route handler redirects with a %s status code`,
      async (statusCode) => {
        const postRequests = []
        const responseCodes = []

        const browser = await next.browser('/redirects', {
          beforePageLoad(page) {
            page.on('request', (request) => {
              const url = new URL(request.url())
              if (request.method() === 'POST') {
                postRequests.push(`${url.pathname}${url.search}`)
              }
            })

            page.on('response', (response) => {
              const url = new URL(response.url())
              const status = response.status()

              if (postRequests.includes(`${url.pathname}${url.search}`)) {
                responseCodes.push(status)
              }
            })
          },
        })

        await browser.elementById(`submit-api-redirect-${statusCode}`).click()
        await retry(async () => {
          expect(await browser.url()).toContain('success=true')
        })
        expect(await browser.elementById('redirect-page')).toBeTruthy()

        // since a 307/308 status code follows the redirect, the POST request should be made to both the route handler and the redirect target
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

      await retry(async () => {
        const newNumber = await getNumber()
        // Expect that the number changes on each click
        expect(newNumber).not.toBe(firstNumber)
      })
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

      await retry(async () => {
        const newNumber = await getNumber()
        // Expect that the number is the same on each click
        expect(newNumber).toBe(firstNumber)
      })
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

      await retry(async () => {
        const newNumber = await getNumber()
        // Expect that the number is the same on each click
        expect(newNumber).toBe(firstNumber)
      })
    })
  })

  describe('request body decoding', () => {
    it.each(['node', 'edge'])(
      'should correctly decode multi-byte characters in the request body (%s)',
      async (runtime) => {
        const browser = await next.browser(`/decode-req-body/${runtime}`)

        await browser.elementByCss('button').click()
        const result = await browser.elementByCss('p').text()

        expect(result).toEqual(
          'Server responded with 100000 あ characters and 0 � characters.'
        )
      }
    )
  })

  describe('action discarding', () => {
    // TODO: Investigate flaky behavior when deployed
    if (!isNextDeploy) {
      it('should not trigger a refresh for a server action that gets discarded due to a navigation (without revalidation)', async () => {
        let browser = await next.browser('/action-discarding')
        await browser.waitForIdleNetwork()
        const initialRandomNumber = await browser
          .elementByCss('#cached-random')
          .text()

        await browser.elementByCss('#slow-action').click()

        // navigate to destination
        await browser.elementByCss('#navigate-destination').click()

        // wait for the 2s action to finish
        await waitFor(2000)

        await retry(async () => {
          const newRandomNumber = await browser
            .elementByCss('#cached-random')
            .text()

          expect(newRandomNumber).toBe(initialRandomNumber)
        })
      })
    }

    it('should trigger a refresh for a server action that gets discarded due to a navigation (with revalidation)', async () => {
      let browser = await next.browser('/action-discarding')
      await browser.waitForIdleNetwork()
      const initialRandomNumber = await browser
        .elementByCss('#cached-random')
        .text()

      await browser.elementByCss('#slow-action-revalidate').click()

      // navigate to destination
      await browser.elementByCss('#navigate-destination').click()

      // wait for the 2s action to finish
      await waitFor(2000)

      await retry(async () => {
        const newRandomNumber = await browser
          .elementByCss('#cached-random')
          .text()

        expect(newRandomNumber).not.toBe(initialRandomNumber)
      })
    })
  })
})
