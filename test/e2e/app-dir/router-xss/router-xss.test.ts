import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('default', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('warns on javascript URLs for client-side navigation', async () => {
    const browser = await next.browser('/untrusted-client-side-navigation', {
      pushErrorAsConsoleLog: true,
      waitHydration: true,
    })

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual(
      isNextDev
        ? [
            {
              source: 'error',
              message: expect.stringContaining(
                'Warning: A future version of React will block javascript: URLs as a security precaution. ' +
                  'Use event handlers instead if you can. ' +
                  'If you need to generate unsafe HTML try using dangerouslySetInnerHTML instead. ' +
                  'React was passed %s.%s "javascript:console.log(\'XSS untrusted client-side navigation\');"'
              ),
            },
          ]
        : []
    )

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual(
        isNextDev
          ? [
              {
                source: 'error',
                message:
                  'A future version of Next.js will block `javascript:` URLs as a security precaution. ' +
                  'Use event handlers instead if you can. ' +
                  'If you need to push unsafe URLs, use `router.push({ unsafeHref: { __href: href } })` instead. ' +
                  'A client-side navigation to "%s" was triggered. ' +
                  '"javascript:console.log(\'XSS untrusted client-side navigation\');"',
              },
              {
                source: 'log',
                message: 'XSS untrusted client-side navigation',
              },
            ]
          : [
              {
                source: 'log',
                message: 'XSS untrusted client-side navigation',
              },
            ]
      )
    })
  })

  it('warns on javascript URLs for client-side navigation with as', async () => {
    const browser = await next.browser(
      '/untrusted-client-side-navigation-with-as',
      {
        pushErrorAsConsoleLog: true,
        waitHydration: true,
      }
    )

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual(
      isNextDev
        ? [
            {
              source: 'error',
              message: expect.stringContaining(
                'Warning: A future version of React will block javascript: URLs as a security precaution. ' +
                  'Use event handlers instead if you can. ' +
                  'If you need to generate unsafe HTML try using dangerouslySetInnerHTML instead. ' +
                  'React was passed %s.%s "javascript:console.log(\'XSS untrusted client-side navigation with as\');"'
              ),
            },
          ]
        : []
    )

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual(
        isNextDev
          ? [
              {
                source: 'error',
                message:
                  'A future version of Next.js will block `javascript:` URLs as a security precaution. ' +
                  'Use event handlers instead if you can. ' +
                  'If you need to push unsafe URLs, use `router.push({ unsafeHref: { __href: href } })` instead. ' +
                  'A client-side navigation to "%s" was triggered. ' +
                  '"javascript:console.log(\'XSS untrusted client-side navigation with as\');"',
              },
              ...(process.env.__NEXT_EXPERIMENTAL_PPR
                ? [
                    {
                      source: 'log',
                      message: expect.stringContaining('received ws message'),
                    },
                  ]
                : []),
              {
                source: 'log',
                message: 'XSS untrusted client-side navigation with as',
              },
            ]
          : [
              {
                source: 'log',
                message: 'XSS untrusted client-side navigation with as',
              },
            ]
      )
    })
  })

  it('warns on javascript URLs for router.push', async () => {
    const browser = await next.browser('/untrusted-push', {
      pushErrorAsConsoleLog: true,
      waitHydration: true,
    })

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual([])

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual(
        isNextDev
          ? [
              {
                source: 'error',
                message:
                  'A future version of Next.js will block `javascript:` URLs as a security precaution. ' +
                  'Use event handlers instead if you can. ' +
                  'If you need to push unsafe URLs, use `router.push({ unsafeHref: { __href: href } })` instead. ' +
                  'A client-side navigation to "%s" was triggered. ' +
                  '"javascript:console.log(\'XSS untrusted push\');"',
              },
              {
                source: 'log',
                message: 'XSS untrusted push',
              },
            ]
          : [
              {
                source: 'log',
                message: 'XSS untrusted push',
              },
            ]
      )
    })
  })

  it('does not warn if router.push is trusted', async () => {
    const browser = await next.browser('/trusted-push', {
      pushErrorAsConsoleLog: true,
      waitHydration: true,
    })

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual([])

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual([
        {
          source: 'log',
          message: 'XSS trusted push',
        },
      ])
    })
  })
})

describe('hardenedXSSProtection', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      experimental: {
        hardenedXSSProtection: true,
      },
    },
  })

  it('warns on javascript URLs for client-side navigation', async () => {
    const browser = await next.browser('/untrusted-client-side-navigation', {
      pushErrorAsConsoleLog: true,
      waitHydration: true,
    })

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    if (isNextDev) {
      expect(consoleErrorCalls).toEqual(
        isNextDev
          ? [
              {
                source: 'error',
                message: expect.stringContaining(
                  'Warning: A future version of React will block javascript: URLs as a security precaution. ' +
                    'Use event handlers instead if you can. ' +
                    'If you need to generate unsafe HTML try using dangerouslySetInnerHTML instead. ' +
                    'React was passed %s.%s "javascript:console.log(\'XSS untrusted client-side navigation\');"'
                ),
              },
            ]
          : []
      )

      await browser.elementById('trigger').click()

      await retry(async () => {
        const consoleCallsAfterInteraction = consoleCalls.slice(
          initialConsoleCalls.length
        )
        expect(consoleCallsAfterInteraction).toEqual([
          {
            source: 'error',
            message: expect.stringContaining(
              'Next.js has blocked a `javascript:` URL as a security precaution.'
            ),
          },
        ])
      })
    } else {
      // prefetch happens immediately throwing and triggering a client-side exception
      expect(consoleErrorCalls).toEqual([
        {
          source: 'error',
          message: expect.stringContaining(
            'Next.js has blocked a `javascript:` URL as a security precaution.'
          ),
        },
      ])
    }
  })

  it('throws on javascript URLs for client-side navigation with as', async () => {
    const browser = await next.browser(
      '/untrusted-client-side-navigation-with-as',
      {
        pushErrorAsConsoleLog: true,
        waitHydration: true,
      }
    )

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual(
      isNextDev
        ? [
            {
              source: 'error',
              message: expect.stringContaining(
                'Warning: A future version of React will block javascript: URLs as a security precaution. ' +
                  'Use event handlers instead if you can. ' +
                  'If you need to generate unsafe HTML try using dangerouslySetInnerHTML instead. ' +
                  'React was passed %s.%s "javascript:console.log(\'XSS untrusted client-side navigation with as\');"'
              ),
            },
          ]
        : []
    )

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual([
        {
          source: 'error',
          message:
            'Next.js has blocked a `javascript:` URL as a security precaution.',
        },
        ...(process.env.__NEXT_EXPERIMENTAL_PPR
          ? [
              {
                source: 'log',
                message: expect.stringContaining('received ws message'),
              },
            ]
          : []),
      ])
    })
  })

  it('throws on javascript URLs for router.push', async () => {
    const browser = await next.browser('/untrusted-push', {
      pushErrorAsConsoleLog: true,
      waitHydration: true,
    })

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual([])

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual([
        {
          source: 'error',
          message: expect.stringContaining(
            'Next.js has blocked a `javascript:` URL as a security precaution.'
          ),
        },
        // React invokeGuardedCallback stuff. Fixed in React 19.0.0-canary-36e62c603-20240418.
        {
          source: 'error',
          message: expect.stringContaining(
            'Next.js has blocked a `javascript:` URL as a security precaution.'
          ),
        },
      ])
    })
  })

  it('does not throw if router.push is trusted', async () => {
    const browser = await next.browser('/trusted-push', {
      pushErrorAsConsoleLog: true,
      waitHydration: true,
    })

    const consoleCalls = await browser.log()
    const initialConsoleCalls = consoleCalls.slice()
    const consoleErrorCalls = initialConsoleCalls.filter((call) => {
      return call.source === 'error'
    })
    expect(consoleErrorCalls).toEqual([])

    await browser.elementById('trigger').click()

    await retry(async () => {
      const consoleCallsAfterInteraction = consoleCalls.slice(
        initialConsoleCalls.length
      )
      expect(consoleCallsAfterInteraction).toEqual([
        {
          source: 'log',
          message: 'XSS trusted push',
        },
      ])
    })
  })
})
