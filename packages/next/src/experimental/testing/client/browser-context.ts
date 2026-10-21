import {
  queries,
  prettyDOM,
  domMatchers,
} from '../../../compiled/next-test-primitives/browser'
import * as common from '../vitest'
import { assertBrowserApiScope, captureAsyncScope } from './async-context'
import type { ClientBrowserCommand } from './protocol'
import type { Locator, Page } from 'playwright'

type Query = (...args: any[]) => Element[]
type DragOptions = Parameters<Page['dragAndDrop']>[2]
type ClickOptions = Parameters<Locator['click']>[0]
type DoubleClickOptions = Parameters<Locator['dblclick']>[0]
type HoverOptions = Parameters<Locator['hover']>[0]
type FillOptions = Parameters<Locator['fill']>[1]
type ClearOptions = Parameters<Locator['clear']>[0]
type SelectOptions = Parameters<Locator['selectOption']>[1]
type SelectValues =
  | string
  | string[]
  | HTMLElement
  | HTMLElement[]
  | ElementLocator
  | ElementLocator[]
type UploadOptions = Parameters<Locator['setInputFiles']>[1]
type UploadFiles = string | string[] | File | File[]
type TypeOptions = { skipClick?: boolean; skipAutoClose?: boolean }
type WheelOptions = { times?: number } & (
  | {
      delta: { x: number; y?: number } | { x?: number; y: number }
      direction?: undefined
    }
  | { direction: 'up' | 'down' | 'left' | 'right'; delta?: undefined }
)
function resolveWheelOptions(options: WheelOptions) {
  const directions = {
    up: { x: 0, y: -100 },
    down: { x: 0, y: 100 },
    left: { x: -100, y: 0 },
    right: { x: 100, y: 0 },
  }
  const delta = options.delta ?? directions[options.direction!]
  const x = delta?.x ?? 0,
    y = delta?.y ?? 0,
    times = options.times ?? 1
  if (
    !delta ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isSafeInteger(times) ||
    times < 0
  )
    throw new Error('Invalid Browser wheel options.')
  return { delta: { x, y }, times }
}
let command: ((value: ClientBrowserCommand) => Promise<unknown>) | undefined
let nextElement = 0
const extensions: Record<PropertyKey, unknown> = {}
const attribute = 'data-next-test-element'
const deferredLocatorKey = Symbol.for('next.testing.browser.locators')
const deferredLocators = new Map<string, () => Element[]>()
const deferredCommands = new Set<Promise<unknown>>()

/** Only live action callbacks cross the native selector boundary, never source. */
function resolveDeferredLocators(root: Node, id: string): Element[] {
  if (root !== document) return []
  const resolve = deferredLocators.get(id)
  if (!resolve) return []
  if (!command) throw new Error('Browser element transport has closed.')
  return resolve().filter(
    (element) =>
      element instanceof Element &&
      element.ownerDocument === document &&
      element.isConnected
  )
}

function releaseDeferredLocators() {
  if (command || deferredCommands.size) return
  deferredLocators.clear()
  const installed = Object.getOwnPropertyDescriptor(
    globalThis,
    deferredLocatorKey
  )
  if (installed?.value === resolveDeferredLocators)
    Reflect.deleteProperty(globalThis, deferredLocatorKey)
}

async function cleanupDeferredLocators() {
  if (deferredCommands.size) await Promise.allSettled([...deferredCommands])
}

async function dispatchBrowserCommand(
  resolveElement: () => Element | null,
  method: ClientBrowserCommand['method'],
  args: unknown[],
  resolveElements?: () => Element[]
): Promise<void> {
  await dispatchBrowserCommandResult(
    resolveElement,
    method,
    args,
    resolveElements
  )
}

async function dispatchBrowserCommandResult(
  resolveElement: () => Element | null,
  method: ClientBrowserCommand['method'],
  args: unknown[],
  resolveElements?: () => Element[]
) {
  assertBrowserApiScope('utility')
  const element = resolveElement()
  if (
    !element &&
    resolveElements &&
    (method === 'click' ||
      method === 'fill' ||
      method === 'dblClick' ||
      method === 'tripleClick' ||
      method === 'hover' ||
      method === 'unhover' ||
      method === 'selectOptions')
  ) {
    if (!command) throw new Error('Browser element transport has closed.')
    const id = 'next-test-locator-' + nextElement++
    const origin = captureAsyncScope()
    deferredLocators.set(id, () => origin.run(resolveElements))
    let operation: Promise<unknown> | undefined
    try {
      operation = command({ method, element: id, args })
      deferredCommands.add(operation)
      const result = await operation
      assertBrowserApiScope('utility')
      return result
    } finally {
      deferredLocators.delete(id)
      if (operation) deferredCommands.delete(operation)
      releaseDeferredLocators()
    }
  }
  if (!element || !element.isConnected)
    throw new Error('Browser element is not attached to its document.')
  if (!command) throw new Error('Browser element transport has closed.')
  const result = await command({
    method,
    element: browserElementId(element),
    args,
  })
  assertBrowserApiScope('utility')
  return result
}

function browserElementId(element: Element) {
  let id = element.getAttribute(attribute)
  if (!id) {
    id = `next-test-element-${nextElement++}`
    element.setAttribute(attribute, id)
  }
  return id
}

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
    return new ElementLocator(() =>
      this.elements().slice(index, index === -1 ? undefined : index + 1)
    )
  }
  first() {
    return this.nth(0)
  }
  last() {
    return new ElementLocator(() => this.elements().slice(-1))
  }
  and(locator: ElementLocator) {
    return new ElementLocator(() => {
      const matching = new Set(locator.elements())
      return this.elements().filter((element) => matching.has(element))
    })
  }
  or(locator: ElementLocator) {
    return new ElementLocator(() =>
      [...new Set([...this.elements(), ...locator.elements()])].sort(
        (left, right) => {
          const position = left.compareDocumentPosition(right)
          if (position & Node.DOCUMENT_POSITION_DISCONNECTED) return 0
          return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        }
      )
    )
  }
  query() {
    return this.element()
  }
  async click(options?: ClickOptions) {
    await this.dispatch('click', options === undefined ? [] : [options])
  }
  async dblClick(options?: DoubleClickOptions) {
    await this.dispatch('dblClick', options === undefined ? [] : [options])
  }
  async tripleClick(options?: ClickOptions) {
    await this.dispatch('tripleClick', options === undefined ? [] : [options])
  }
  async unhover(options?: HoverOptions) {
    await this.dispatch('unhover', options === undefined ? [] : [options])
  }
  async hover(options?: HoverOptions) {
    await this.dispatch('hover', options === undefined ? [] : [options])
  }
  async wheel(options: WheelOptions) {
    assertBrowserApiScope('utility')
    const resolved = resolveWheelOptions(options)
    await this.dispatch('wheel', [resolved])
    // Match Chromium's compositor settling used by the native provider.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    assertBrowserApiScope('utility')
  }
  async dropTo(target: ElementLocator, options?: DragOptions) {
    assertBrowserApiScope('utility')
    const sourceElement = this.element()
    const targetElement = target.element()
    if (!sourceElement?.isConnected || !targetElement?.isConnected)
      throw new Error('Browser element is not attached to its document.')
    await dispatchBrowserCommand(() => sourceElement, 'dragAndDrop', [
      browserElementId(targetElement),
      ...(options === undefined ? [] : [options]),
    ])
  }
  async fill(value: string, options?: FillOptions) {
    await this.dispatch(
      'fill',
      options === undefined ? [value] : [value, options]
    )
  }
  async clear(options?: ClearOptions) {
    await this.dispatch('clear', options === undefined ? [] : [options])
  }
  async selectOptions(value: SelectValues, options?: SelectOptions) {
    assertBrowserApiScope('utility')
    const values = (Array.isArray(value) ? value : [value]).map((option) => {
      if (typeof option === 'string') return option
      const element =
        option instanceof ElementLocator ? option.element() : option
      if (!element?.isConnected)
        throw new Error(
          'Browser option element is not attached to its document.'
        )
      return { element: browserElementId(element) }
    })
    await this.dispatch('selectOptions', [
      values,
      ...(options === undefined ? [] : [options]),
    ])
  }
  async upload(files: UploadFiles, options?: UploadOptions) {
    assertBrowserApiScope('utility')
    const values = await Promise.all(
      (Array.isArray(files) ? files : [files]).map(async (file) => {
        if (typeof file === 'string') return file
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') resolve(reader.result)
            else reject(new Error(`Failed to read upload file: ${file.name}`))
          }
          reader.onerror = () =>
            reject(new Error(`Failed to read upload file: ${file.name}`))
          reader.readAsDataURL(file)
        })
        return {
          name: file.name,
          mimeType: file.type,
          base64: data.slice(data.indexOf(',') + 1),
        }
      })
    )
    await this.dispatch('upload', [
      values,
      ...(options === undefined ? [] : [options]),
    ])
  }
  private async dispatch(
    method: ClientBrowserCommand['method'],
    args: unknown[]
  ) {
    await dispatchBrowserCommand(
      () => this.element(),
      method,
      args,
      () => this.elements()
    )
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
function eventLocator(element: Element | ElementLocator) {
  return element instanceof ElementLocator
    ? element
    : page.elementLocator(element)
}
/** Native interactions share the same scoped Locator and Playwright transport. */
const userEventActions = {
  dragAndDrop(
    source: Element | ElementLocator,
    target: Element | ElementLocator,
    options?: DragOptions
  ) {
    return eventLocator(source).dropTo(eventLocator(target), options)
  },
  wheel(element: Element | ElementLocator, options: WheelOptions) {
    return eventLocator(element).wheel(options)
  },
  tab(options: { shift?: boolean } = {}) {
    return dispatchBrowserCommand(() => document.body, 'tab', [options])
  },
  click(element: Element | ElementLocator, options?: ClickOptions) {
    return eventLocator(element).click(options)
  },
  dblClick(element: Element | ElementLocator, options?: DoubleClickOptions) {
    return eventLocator(element).dblClick(options)
  },
  tripleClick(element: Element | ElementLocator, options?: ClickOptions) {
    return eventLocator(element).tripleClick(options)
  },
  unhover(element: Element | ElementLocator, options?: HoverOptions) {
    return eventLocator(element).unhover(options)
  },
  hover(element: Element | ElementLocator, options?: HoverOptions) {
    return eventLocator(element).hover(options)
  },
  fill(
    element: Element | ElementLocator,
    value: string,
    options?: FillOptions
  ) {
    return eventLocator(element).fill(value, options)
  },
  clear(element: Element | ElementLocator, options?: ClearOptions) {
    return eventLocator(element).clear(options)
  },
  selectOptions(
    element: Element | ElementLocator,
    value: SelectValues,
    options?: SelectOptions
  ) {
    return eventLocator(element).selectOptions(value, options)
  },
  upload(
    element: Element | ElementLocator,
    files: UploadFiles,
    options?: UploadOptions
  ) {
    return eventLocator(element).upload(files, options)
  },
}
function createUserEvent() {
  let unreleased: string[] = []
  async function cleanup(internal = false) {
    if (!internal) assertBrowserApiScope('utility')
    if (!unreleased.length) return
    if (!command) throw new Error('Browser element transport has closed.')
    await command({
      method: 'keyboardCleanup',
      element: `next-test-element-${nextElement++}`,
      args: [unreleased],
    })
    unreleased = []
    if (!internal) assertBrowserApiScope('utility')
  }
  const event = {
    ...userEventActions,
    setup() {
      assertBrowserApiScope('utility')
      return createUserEvent().event
    },
    cleanup: () => cleanup(),
    async type(
      element: Element | ElementLocator,
      text: string,
      options?: TypeOptions
    ) {
      const args: unknown[] = options === undefined ? [text] : [text, options]
      if (unreleased.length) args.splice(1, 2, options ?? {}, unreleased)
      const result = await dispatchBrowserCommandResult(
        () => eventLocator(element).element(),
        'type',
        args
      )
      unreleased = (result as { unreleased: string[] } | null)?.unreleased ?? []
    },
    async keyboard(text: string) {
      const result = await dispatchBrowserCommandResult(
        () => document.body,
        'keyboard',
        unreleased.length ? [text, unreleased] : [text]
      )
      unreleased = (result as { unreleased: string[] } | null)?.unreleased ?? []
    },
    copy(): Promise<void> {
      return event.keyboard('{ControlOrMeta>}{c}{/ControlOrMeta}')
    },
    cut(): Promise<void> {
      return event.keyboard('{ControlOrMeta>}{x}{/ControlOrMeta}')
    },
    paste(): Promise<void> {
      return event.keyboard('{ControlOrMeta>}{v}{/ControlOrMeta}')
    },
  }
  return { cleanup, event }
}
const defaultUserEvent = createUserEvent()
export const userEvent = defaultUserEvent.event
/** The runner owns default keyboard cleanup; setup instances retain their owner. */
export async function cleanupBrowserKeyboard() {
  await defaultUserEvent.cleanup(true)
}

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
  if (command || deferredCommands.size)
    throw new Error('Browser context already has an owner.')
  Object.defineProperty(globalThis, deferredLocatorKey, {
    configurable: true,
    value: resolveDeferredLocators,
  })
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
      releaseDeferredLocators()
    },
  }
}
/** The published component helper owns the real React roots and unmount logic. */
export async function cleanupBrowserContext() {
  const failures: unknown[] = []
  for (const cleanup of [
    ...(deferredCommands.size ? [cleanupDeferredLocators] : []),
    cleanupBrowserKeyboard,
    extensions[Symbol.for('vitest:component-cleanup')],
  ]) {
    if (typeof cleanup !== 'function') continue
    try {
      await cleanup()
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length)
    throw new AggregateError(failures, 'Browser context cleanup failed.')
}
