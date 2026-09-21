import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const NOT_IMPLEMENTED_ERROR =
  'Not implemented: this behavior is not yet supported when ' +
  '`experimental.concurrentRouterQueue` is enabled.'

// `experimental.concurrentRouterQueue` swaps the router's entry-point modules
// (the navigator and the callServer action door) for the concurrent
// implementations at the bundler level. The concurrent implementations are
// currently stubs that throw a single distinctive error from every operation,
// so this suite verifies the fork wiring: the app boots on the concurrent
// modules without touching them, and every old-world entry point fails
// loudly instead of silently running the sequential implementation.
describe('concurrent-router-queue', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Not gated: a clean hydration is expected in both states of the flag.
  it('hydrates cleanly without invoking the forked entry points', async () => {
    // `pushErrorAsConsoleLog` records uncaught page errors into the console
    // log capture, which works in both dev and start modes.
    const browser = await next.browser('/', { pushErrorAsConsoleLog: true })
    expect(await browser.elementByCss('#home').text()).toBe('home')
    // Hydration is complete once the client components are interactive.
    await browser.waitForElementByCss('#invoke-action')
    // Nothing at boot may call into the stubs (or fail in any other way).
    const errors = (await browser.log()).filter((log) => log.source === 'error')
    expect(errors).toEqual([])
  })

  // The stubs only throw when the fork is active; with the flag off, the
  // sequential router handles the navigation and the test fails its
  // expectations — which is what the gate asserts on the axis-A run.
  // @gate concurrentRouterQueue
  it('fails loudly on link navigation', async () => {
    const browser = await next.browser('/', { pushErrorAsConsoleLog: true })
    await browser.waitForElementByCss('#invoke-action')

    await browser.elementByCss('#to-target-page').click()

    // The stub throws synchronously inside the click handler, which surfaces
    // as an uncaught page error. Wait for it to confirm the click was
    // processed.
    await retry(async () => {
      const errors = (await browser.log()).filter(
        (log) =>
          log.source === 'error' && log.message.includes(NOT_IMPLEMENTED_ERROR)
      )
      expect(errors.length).toBeGreaterThan(0)
    })

    // No navigation happened, soft or hard: Link calls preventDefault()
    // before dispatching, and the stub throws before any router state or
    // pending-URL bookkeeping, so there is no fallback hard navigation.
    expect(new URL(await browser.url()).pathname).toBe('/')
    // The home page is still rendered; the target page never appears.
    expect(await browser.elementByCss('#home').text()).toBe('home')
    expect(await browser.hasElementByCssSelector('#target-page')).toBe(false)
  })

  // @gate concurrentRouterQueue
  it('fails loudly on server action invocation', async () => {
    const browser = await next.browser('/')
    await browser.waitForElementByCss('#invoke-action')

    await browser.elementByCss('#invoke-action').click()

    // callServer is async, so the stub surfaces as a rejection of the promise
    // returned to the action caller, which the fixture renders. The result
    // element is empty (and hidden) until the rejection renders, so
    // elementByCss waits for it to appear.
    expect(await browser.elementByCss('#action-result').text()).toBe(
      `rejected: ${NOT_IMPLEMENTED_ERROR}`
    )
  })
})
