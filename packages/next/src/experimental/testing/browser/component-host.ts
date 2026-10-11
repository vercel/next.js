import type { Locator, Page } from 'playwright'
import { validateFixtureProps } from '../rsc/fixture-data'
import { BrowserFixtureError } from './context'

/** Only compiler-registered identities reach the browser; no source paths. */
export interface ComponentHostConnection {
  routePrefix: string
  fixtureIds: readonly string[]
}

export function createComponentMount(options: {
  page: Page
  baseURL: string
  host?: ComponentHostConnection
  signal: AbortSignal
  assertActiveAttempt(): void
}): {
  mount(id: string, props?: Record<string, unknown>): Promise<Locator>
  dispose(): void
} {
  const errors: Error[] = []
  const onPageError = (error: Error) => errors.push(error)
  const onConsole = (message: import('playwright').ConsoleMessage) => {
    if (
      message.type() === 'error' &&
      /hydration|hydrating|server rendered html/i.test(message.text())
    ) {
      errors.push(new Error(message.text()))
    }
  }
  let listening = false
  let mounting = false
  function dispose() {
    options.page.off('pageerror', onPageError)
    options.page.off('console', onConsole)
    if (errors.length)
      throw new BrowserFixtureError('Browser component failed', errors)
  }
  async function mount(
    id: string,
    props: Record<string, unknown> = {}
  ): Promise<Locator> {
    options.assertActiveAttempt()
    options.signal.throwIfAborted()
    const { host } = options
    if (!host)
      throw new Error(
        'Browser component mounting requires registered development fixtures'
      )
    if (!host.fixtureIds.includes(id))
      throw new Error(`Unknown registered browser fixture: ${id}`)
    if (mounting)
      throw new Error(
        'Concurrent component mounting in one test attempt is unsupported'
      )
    validateFixtureProps(props)
    const serialized = JSON.stringify(props)
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) {
      throw new Error('Browser fixture props exceed the 64 KiB limit')
    }
    const url = new URL(
      `${host.routePrefix}/${encodeURIComponent(id)}`,
      options.baseURL
    )
    url.searchParams.set('__nextFixtureProps', serialized)
    if (
      new TextEncoder().encode(url.pathname + url.search).byteLength >
      8 * 1024
    ) {
      throw new Error(
        'Browser fixture props exceed the 8 KiB encoded URL transport limit'
      )
    }
    if (!listening) {
      options.page.on('pageerror', onPageError)
      options.page.on('console', onConsole)
      listening = true
    }
    mounting = true
    try {
      const response = await options.page.goto(url.href)
      options.assertActiveAttempt()
      options.signal.throwIfAborted()
      if (!response?.ok())
        throw new Error(
          `Browser fixture page failed (${response?.status() ?? 'no response'})`
        )
      const root = options.page.locator(
        '[data-next-test-root][data-next-test-hydrated="true"]'
      )
      await root.waitFor({ state: 'attached' })
      options.assertActiveAttempt()
      options.signal.throwIfAborted()
      if (errors.length)
        throw new BrowserFixtureError('Browser component failed', [...errors])
      return root
    } catch (error) {
      // A rejected navigation can settle after the attempt has closed. Consult
      // the originating runner scope even when the caller catches this promise.
      options.assertActiveAttempt()
      throw error
    } finally {
      mounting = false
    }
  }
  return { mount, dispose }
}
