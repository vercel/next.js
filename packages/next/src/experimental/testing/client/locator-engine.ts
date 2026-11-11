import type { Selectors } from 'playwright'

export const clientLocatorEngine = 'nexttestlocator'
const registrations = new WeakMap<Selectors, Promise<void>>()

/** Register before page creation on the exact project Playwright binding. */
export function registerClientLocators(
  playwright: Pick<typeof import('playwright'), 'selectors'>
): Promise<void> {
  const { selectors } = playwright
  let registration = registrations.get(selectors)
  if (!registration) {
    registration = selectors
      .register(
        clientLocatorEngine,
        () => ({
          query(root: Node, id: string) {
            return this.queryAll(root, id)[0] ?? null
          },
          queryAll(root: Node, id: string): Element[] {
            // The real file realm owns these callbacks and their live scopes.
            const resolve = Reflect.get(
              globalThis,
              Symbol.for('next.testing.browser.locators')
            )
            return typeof resolve === 'function'
              ? Reflect.apply(resolve, undefined, [root, id])
              : []
          },
        }),
        { contentScript: false }
      )
      .catch((error) => {
        if (registrations.get(selectors) === registration)
          registrations.delete(selectors)
        throw error
      })
    registrations.set(selectors, registration)
  }
  return registration
}
