import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

/**
 * This test demonstrates the AsyncLocalStorage context loss issue
 * when React's scheduler continues a suspended component.
 *
 * The test uses the same infrastructure as the flaky prefetch-runtime tests
 * to ensure we're hitting the runtime prefetch code path.
 */
describe('AsyncLocalStorage context loss in React scheduler', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (isNextDev || skipped) {
    test('skipped', () => {})
    return
  }

  it('loses context after awaiting params in runtime prefetch', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    // Navigate to the params test page via prefetch
    // This triggers runtime prefetch on the server
    await act(
      async () => {
        // Navigate to the dynamic params page
        await browser.elementByCss('a[href="/test-page/123"]').click()
      },
      {
        // We expect the page to render with the result
        includes: 'Param ID: 123',
      }
    )

    // Check server logs for context status
    const logs = next.cliOutput

    // Look for the context logs during runtime prefetch
    const hasContextLost = logs.includes('[PARAMS] CONTEXT_STATUS: LOST')
    const hasContextPreserved = logs.includes(
      '[PARAMS] CONTEXT_STATUS: PRESERVED'
    )

    console.log('Server logs contain CONTEXT_STATUS: LOST:', hasContextLost)
    console.log(
      'Server logs contain CONTEXT_STATUS: PRESERVED:',
      hasContextPreserved
    )

    // If context is lost, this test fails - demonstrating the bug
    if (hasContextLost) {
      console.log('\n=== BUG CONFIRMED ===')
      console.log('AsyncLocalStorage context is LOST after awaiting params')
      console.log('This causes io() to fail to detect sync IO operations')
      console.log('=====================\n')
    }

    expect(hasContextLost).toBe(false)
    expect(hasContextPreserved).toBe(true)
  })

  it('loses context after awaiting cookies() in runtime prefetch', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await act(
      async () => {
        await browser.elementByCss('a[href="/test-cookies"]').click()
      },
      {
        includes: 'Cookies count:',
      }
    )

    const logs = next.cliOutput
    const hasContextLost = logs.includes('[COOKIES] CONTEXT_STATUS: LOST')
    const hasContextPreserved = logs.includes(
      '[COOKIES] CONTEXT_STATUS: PRESERVED'
    )

    console.log(
      'COOKIES - Context Lost:',
      hasContextLost,
      'Preserved:',
      hasContextPreserved
    )

    expect(hasContextLost).toBe(false)
    expect(hasContextPreserved).toBe(true)
  })

  it('loses context after awaiting headers() in runtime prefetch', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    await act(
      async () => {
        await browser.elementByCss('a[href="/test-headers"]').click()
      },
      {
        includes: 'User-Agent:',
      }
    )

    const logs = next.cliOutput
    const hasContextLost = logs.includes('[HEADERS] CONTEXT_STATUS: LOST')
    const hasContextPreserved = logs.includes(
      '[HEADERS] CONTEXT_STATUS: PRESERVED'
    )

    console.log(
      'HEADERS - Context Lost:',
      hasContextLost,
      'Preserved:',
      hasContextPreserved
    )

    expect(hasContextLost).toBe(false)
    expect(hasContextPreserved).toBe(true)
  })
})
