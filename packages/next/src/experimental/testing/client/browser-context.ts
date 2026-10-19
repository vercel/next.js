import {
  queries,
  prettyDOM,
  domMatchers,
} from '../../../compiled/next-test-primitives/browser'
import * as common from '../vitest'
import { assertBrowserApiScope } from './async-context'
import type { ClientBrowserCommand } from './protocol'

type Query = (...args: any[]) => Element[]
let command: ((value: ClientBrowserCommand) => Promise<unknown>) | undefined
let nextElement = 0
const extensions: Record<PropertyKey, unknown> = {}
const attribute = 'data-next-test-element'

/** Queries execute in the actual document. Input commands stay Playwright-owned. */
class ElementLocator {
  constructor(private readonly resolve: () => Element[]) {}
  elements() {
    assertBrowserApiScope('utility')
    return this.resolve()
  }
  element(): Element | null {
    const values = this.elements()
    if (values.length > 1)
      throw new Error(
        `Expected a unique browser element, received ${values.length}.`
      )
    return values[0] ?? null
  }
  all() {
    return this.elements().map((value) => new ElementLocator(() => [value]))
  }
  nth(index: number) {
    return new ElementLocator(() => this.elements().slice(index, index + 1))
  }
  first() {
    return this.nth(0)
  }
  last() {
    return new ElementLocator(() => this.elements().slice(-1))
  }
  query() {
    return this.element()
  }
  async click() {
    await this.dispatch('click', [])
  }
  async dblClick() {
    await this.dispatch('dblClick', [])
  }
  async hover() {
    await this.dispatch('hover', [])
  }
  async fill(value: string) {
    await this.dispatch('fill', [value])
  }
  async clear() {
    await this.dispatch('clear', [])
  }
  async selectOptions(value: string | string[]) {
    await this.dispatch('selectOptions', [
      Array.isArray(value) ? value : [value],
    ])
  }
  private async dispatch(
    method: ClientBrowserCommand['method'],
    args: unknown[]
  ) {
    assertBrowserApiScope('utility')
    const element = this.element()
    if (!element || !element.isConnected)
      throw new Error('Browser element is not attached to its document.')
    if (!command) throw new Error('Browser element transport has closed.')
    let id = element.getAttribute(attribute)
    if (!id) {
      id = `next-test-element-${nextElement++}`
      element.setAttribute(attribute, id)
    }
    await command({ method, element: id, args })
    assertBrowserApiScope('utility')
  }
  getByRole(...args: any[]) {
    return selector(this, 'Role', args)
  }
  getByText(...args: any[]) {
    return selector(this, 'Text', args)
  }
  getByLabelText(...args: any[]) {
    return selector(this, 'LabelText', args)
  }
  getByPlaceholder(...args: any[]) {
    return selector(this, 'PlaceholderText', args)
  }
  getByAltText(...args: any[]) {
    return selector(this, 'AltText', args)
  }
  getByTitle(...args: any[]) {
    return selector(this, 'Title', args)
  }
  getByTestId(...args: any[]) {
    return selector(this, 'TestId', args)
  }
}
function selector(
  root: Element | ElementLocator,
  name: string,
  args: unknown[]
) {
  const query = Reflect.get(queries, `queryAllBy${name}`) as Query
  if (typeof query !== 'function')
    throw new Error(`Unsupported browser query ${name}.`)
  return new ElementLocator(() => {
    const elements = root instanceof ElementLocator ? root.elements() : [root]
    return [...new Set(elements.flatMap((value) => query(value, ...args)))]
  })
}
function selectors(root: Element | ElementLocator) {
  return {
    getByRole: (...args: unknown[]) => selector(root, 'Role', args),
    getByText: (...args: unknown[]) => selector(root, 'Text', args),
    getByLabelText: (...args: unknown[]) => selector(root, 'LabelText', args),
    getByPlaceholder: (...args: unknown[]) =>
      selector(root, 'PlaceholderText', args),
    getByAltText: (...args: unknown[]) => selector(root, 'AltText', args),
    getByTitle: (...args: unknown[]) => selector(root, 'Title', args),
    getByTestId: (...args: unknown[]) => selector(root, 'TestId', args),
  }
}
const root = new ElementLocator(() => [document.body])
export const page = Object.assign(selectors(root), {
  elementLocator(element: Element) {
    assertBrowserApiScope('utility')
    if (!(element instanceof Element) || element.ownerDocument !== document)
      throw new Error('Browser locator must belong to its owned document.')
    return new ElementLocator(() => [element])
  },
  extend(values: Record<PropertyKey, unknown>) {
    assertBrowserApiScope('declaration')
    Object.assign(extensions, values)
    Object.assign(page, values)
  },
})
export const server = {
  config: { browser: { locators: { testIdAttribute: 'data-testid' } } },
}
export const utils = {
  getElementLocatorSelectors: selectors,
  debug(
    element: Element = document.body,
    maxLength?: number,
    options?: unknown
  ) {
    assertBrowserApiScope('utility')
    console.log(prettyDOM(element, maxLength, options as any))
  },
}
export function elementExpect(
  value: Element | ElementLocator | null,
  options?: { timeout?: number; interval?: number; message?: string }
) {
  assertBrowserApiScope('assertion')
  return common.expect.poll(
    () => (value instanceof ElementLocator ? value.element() : value),
    options
  )
}
export function initializeBrowserContext(send: NonNullable<typeof command>) {
  if (command) throw new Error('Browser context already has an owner.')
  command = send
  return {
    install() {
      // jest-dom declares assertion methods; this entry contains their raw matcher functions.
      common.expect.extend(
        domMatchers as unknown as Parameters<typeof common.expect.extend>[0]
      )
    },
    dispose() {
      command = undefined
    },
  }
}
/** The published component helper owns the real React roots and unmount logic. */
export async function cleanupBrowserContext() {
  const cleanup = extensions[Symbol.for('vitest:component-cleanup')]
  if (typeof cleanup === 'function') await cleanup()
}
