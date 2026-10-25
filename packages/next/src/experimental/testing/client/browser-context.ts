import {
  queries,
  prettyDOM,
  domMatchers,
  createBrowserLocatorFormatter,
} from '../../../compiled/next-test-primitives/browser'
import * as common from '../vitest'
import {
  assertBrowserApiScope,
  captureAsyncScope,
  type ClientCommandAdmission,
} from './async-context'
import type {
  ClientBrowserCommand,
  ClientCommandAttemptOrigin,
} from './protocol'
import type { Task } from '../runner/tasks'
import type { Locator, Page } from 'playwright'
import {
  registerBrowserActionIdentity,
  type BrowserActionIdentity,
} from './browser-action-identity'

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
let command:
  | ((
      value: ClientBrowserCommand,
      origin?: ClientCommandAttemptOrigin
    ) => Promise<unknown>)
  | undefined
type BrowserActionCallbacks = {
  getConsoleTask(): Task | undefined
  captureCommandAdmission?(): ClientCommandAdmission | undefined
}
type AwaitCheckTask = Task & { onFinished?: (() => void)[] }
let actionCallbacks: BrowserActionCallbacks | undefined

class Action<T> implements Promise<T> {
  [Symbol.toStringTag] = 'Action'
  #command: (args: unknown[], options: unknown) => Promise<T>
  #args: unknown[]
  #options: unknown
  #promise: Promise<T> | undefined
  #awaited = false

  constructor(
    perform: (args: unknown[], options: unknown) => Promise<T>,
    args: unknown[],
    options: unknown,
    errorSource?: Error
  ) {
    this.#command = perform
    this.#args = args
    this.#options = options
    const sourceError = errorSource ?? new Error('STACK_TRACE_ERROR')
    const task = actionCallbacks?.getConsoleTask() as AwaitCheckTask | undefined
    if (errorSource || !task || task.type !== 'test') {
      this.#promise = this.#run()
      return
    }
    task.onFinished ??= []
    task.onFinished.push(() => {
      if (!this.#awaited) {
        const error = new Error(
          'The call was not awaited. This method is asynchronous and must be awaited; otherwise, the call will not start to avoid unhandled rejections.'
        )
        error.stack = sourceError.stack?.replace(
          sourceError.message,
          error.message
        )
        throw error
      }
    })
  }

  #run(): Promise<T> {
    return this.#command(this.#args, this.#options)
  }

  #start(): Promise<T> {
    this.#awaited = true
    return (this.#promise ??= this.#run())
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.#start().then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult> {
    return this.#start().catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.#start().finally(onfinally)
  }
}

type LocatorWork<T> = (
  locator: ElementLocator,
  args: unknown[],
  options: unknown
) => Promise<T>

class LocatorAction<T> extends Action<T> {
  constructor(
    perform: LocatorWork<T>,
    locator: ElementLocator,
    args: unknown[],
    options: unknown,
    errorSource?: Error
  ) {
    super(
      (values, actionOptions) => perform(locator, values, actionOptions),
      args,
      options,
      errorSource
    )
    if (new.target === LocatorAction)
      registerBrowserActionIdentity(this, locatorActionIdentity)
  }
}

class UploadAction<T> extends Action<T> {
  constructor(
    perform: LocatorWork<T>,
    locator: ElementLocator,
    args: unknown[],
    options: unknown
  ) {
    super(
      (values, actionOptions) => perform(locator, values, actionOptions),
      args,
      options
    )
    if (new.target === UploadAction)
      registerBrowserActionIdentity(this, uploadActionIdentity)
  }
}

const actionThenDescriptor = Object.getOwnPropertyDescriptor(
  Action.prototype,
  'then'
)!
const locatorActionIdentity: BrowserActionIdentity = {
  prototypes: [LocatorAction.prototype, Action.prototype],
  then: actionThenDescriptor,
}
const uploadActionIdentity: BrowserActionIdentity = {
  prototypes: [UploadAction.prototype, Action.prototype],
  then: actionThenDescriptor,
}

function createAction<T>(
  locator: ElementLocator,
  work: LocatorWork<T>,
  args: unknown[],
  options?: unknown,
  upload = false
): Promise<T> {
  if (!actionCallbacks) return work(locator, args, options)
  return upload
    ? new UploadAction(work, locator, args, options)
    : new LocatorAction(work, locator, args, options)
}

function ensureAwaited<T>(work: () => Promise<T>): Promise<T> {
  if (!actionCallbacks) return work()
  const task = actionCallbacks.getConsoleTask() as AwaitCheckTask | undefined
  if (!task || task.type !== 'test') return work()
  let awaited = false
  const sourceError = new Error('STACK_TRACE_ERROR')
  task.onFinished ??= []
  task.onFinished.push(() => {
    if (!awaited) {
      const error = new Error(
        'The call was not awaited. This method is asynchronous and must be awaited; otherwise, the call will not start to avoid unhandled rejections.'
      )
      error.stack = sourceError.stack?.replace(
        sourceError.message,
        error.message
      )
      throw error
    }
  })
  let promise: Promise<T> | undefined
  return {
    then(onfulfilled, onrejected) {
      awaited = true
      return (promise ??= work()).then(onfulfilled, onrejected)
    },
    catch(onrejected) {
      awaited = true
      return (promise ??= work()).catch(onrejected)
    },
    finally(onfinally) {
      awaited = true
      return (promise ??= work()).finally(onfinally)
    },
    [Symbol.toStringTag]: 'Promise',
  }
}
let nextElement = 0
const attribute = 'data-next-test-element'
const deferredLocatorKey = Symbol.for('next.testing.browser.locators')
const deferredLocators = new Map<string, () => Element[]>()
const deferredCommands = new Set<Promise<unknown>>()
const admittedDeferredCommands = new Set<Promise<unknown>>()

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
  const legacy = [...deferredCommands].filter(
    (operation) => !admittedDeferredCommands.has(operation)
  )
  if (legacy.length) await Promise.allSettled(legacy)
}

async function dispatchBrowserCommand(
  resolveElement: () => Element | null,
  method: ClientBrowserCommand['method'],
  args: unknown[],
  resolveElements?: () => Element[],
  resolveNativeElements?: () => Element[]
): Promise<void> {
  await dispatchBrowserCommandResult(
    resolveElement,
    method,
    args,
    resolveElements,
    resolveNativeElements
  )
}

async function dispatchBrowserCommandResult(
  resolveElement: () => Element | null,
  method: ClientBrowserCommand['method'],
  args: unknown[],
  resolveElements?: () => Element[],
  resolveNativeElements?: () => Element[]
) {
  assertBrowserApiScope('browser-native')
  const admission = actionCallbacks?.captureCommandAdmission?.()
  const element = resolveElement()
  if (
    !element &&
    resolveElements &&
    (method === 'click' ||
      method === 'fill' ||
      method === 'clear' ||
      method === 'dblClick' ||
      method === 'tripleClick' ||
      method === 'hover' ||
      method === 'unhover' ||
      method === 'selectOptions')
  ) {
    if (!command) throw new Error('Browser element transport has closed.')
    const id = 'next-test-locator-' + nextElement++
    const origin = admission ? undefined : captureAsyncScope()
    let operation: Promise<unknown> | undefined
    deferredLocators.set(id, () => {
      if (!admission) return origin!.run(resolveElements)
      if (!operation || !resolveNativeElements)
        throw new Error('Browser locator has no pending command query.')
      return admission.query(operation, resolveNativeElements)
    })
    try {
      operation = admission
        ? command({ method, element: id, args }, admission.origin)
        : command({ method, element: id, args })
      admission?.bind(operation)
      deferredCommands.add(operation)
      if (admission) admittedDeferredCommands.add(operation)
      const result = await operation
      if (!admission) assertBrowserApiScope('browser-native')
      return result
    } finally {
      if (operation) admission?.finish(operation)
      deferredLocators.delete(id)
      if (operation) {
        deferredCommands.delete(operation)
        admittedDeferredCommands.delete(operation)
      }
      releaseDeferredLocators()
    }
  }
  if (!element || !element.isConnected)
    throw new Error('Browser element is not attached to its document.')
  if (!command) throw new Error('Browser element transport has closed.')
  const value = {
    method,
    element: browserElementId(element),
    args,
  }
  const operation = admission
    ? command(value, admission.origin)
    : command(value)
  admission?.bind(operation)
  try {
    const result = await operation
    if (!admission) assertBrowserApiScope('browser-native')
    return result
  } finally {
    admission?.finish(operation)
  }
}

function browserElementId(element: Element) {
  let id = element.getAttribute(attribute)
  if (!id) {
    id = `next-test-element-${nextElement++}`
    element.setAttribute(attribute, id)
  }
  return id
}

const locatorFormatter = createBrowserLocatorFormatter()
let nativeLocatorElements: (locator: ElementLocator) => Element[]

/** Queries execute in the actual document. Input commands stay Playwright-owned. */
class ElementLocator {
  #nativeElements: () => Element[]

  static {
    nativeLocatorElements = (locator) => locator.#nativeElements()
  }

  constructor(
    private readonly resolve: (native?: boolean) => Element[],
    private readonly description: string | (() => string),
    readonly container?: Element,
    private readonly actionElement?: Element
  ) {
    this.#nativeElements = () => resolve(true)
  }
  get selector(): string {
    return typeof this.description === 'function'
      ? this.description()
      : this.description
  }
  elements() {
    assertBrowserApiScope('browser-native')
    return this.resolve()
  }
  element(): Element {
    const value = this.query()
    if (!value)
      throw locatorFormatter.missingError(
        this.selector,
        this.container ?? document.body
      )
    return value
  }
  all() {
    return this.elements().map(
      (value, index) =>
        new ElementLocator(
          () => [value],
          `${this.selector} >> nth=${index}`,
          this.container
        )
    )
  }
  nth(index: number) {
    return new ElementLocator(
      (native) =>
        (native ? this.#nativeElements() : this.elements()).slice(
          index,
          index === -1 ? undefined : index + 1
        ),
      `${this.selector} >> nth=${index}`,
      this.container
    )
  }
  first() {
    return this.nth(0)
  }
  last() {
    return new ElementLocator(
      (native) => (native ? this.#nativeElements() : this.elements()).slice(-1),
      `${this.selector} >> nth=-1`,
      this.container
    )
  }
  and(locator: ElementLocator) {
    return new ElementLocator(
      (native) => {
        const matching = new Set(
          native ? locator.#nativeElements() : locator.elements()
        )
        return (native ? this.#nativeElements() : this.elements()).filter(
          (element) => matching.has(element)
        )
      },
      `${this.selector} >> internal:and=${JSON.stringify(locator.selector)}`,
      this.container
    )
  }
  or(locator: ElementLocator) {
    return new ElementLocator(
      (native) =>
        [
          ...new Set([
            ...(native ? this.#nativeElements() : this.elements()),
            ...(native ? locator.#nativeElements() : locator.elements()),
          ]),
        ].sort((left, right) => {
          const position = left.compareDocumentPosition(right)
          if (position & Node.DOCUMENT_POSITION_DISCONNECTED) return 0
          return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        }),
      `${this.selector} >> internal:or=${JSON.stringify(locator.selector)}`,
      this.container
    )
  }
  query(): Element | null {
    const values = this.elements()
    if (values.length > 1)
      throw locatorFormatter.strictError(this.selector, values)
    return values[0] ?? null
  }
  click(options?: ClickOptions): Promise<void> {
    return this.#action('click', [], options)
  }
  dblClick(options?: DoubleClickOptions): Promise<void> {
    return this.#action('dblClick', [], options)
  }
  tripleClick(options?: ClickOptions): Promise<void> {
    return this.#action('tripleClick', [], options)
  }
  unhover(options?: HoverOptions): Promise<void> {
    return this.#action('unhover', [], options)
  }
  hover(options?: HoverOptions): Promise<void> {
    return this.#action('hover', [], options)
  }
  wheel(options: WheelOptions): Promise<void> {
    return ensureAwaited(async () => {
      assertBrowserApiScope('browser-native')
      const resolved = resolveWheelOptions(options)
      await this.dispatch('wheel', [resolved])
      // Match Chromium's compositor settling used by the native provider.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      )
      assertBrowserApiScope('browser-native')
    })
  }
  dropTo(target: ElementLocator, options?: DragOptions): Promise<void> {
    return createAction(
      this,
      async () => {
        assertBrowserApiScope('browser-native')
        const sourceElement = this.query()
        const targetElement = target.query()
        if (!sourceElement?.isConnected || !targetElement?.isConnected)
          throw new Error('Browser element is not attached to its document.')
        await dispatchBrowserCommand(() => sourceElement, 'dragAndDrop', [
          browserElementId(targetElement),
          ...(options === undefined ? [] : [options]),
        ])
      },
      [target],
      options
    )
  }
  fill(value: string, options?: FillOptions): Promise<void> {
    return this.#action('fill', [value], options)
  }
  clear(options?: ClearOptions): Promise<void> {
    return this.#action('clear', [], options)
  }
  selectOptions(value: SelectValues, options?: SelectOptions): Promise<void> {
    return createAction(
      this,
      async () => {
        assertBrowserApiScope('browser-native')
        const values = (Array.isArray(value) ? value : [value]).map(
          (option) => {
            if (typeof option === 'string') return option
            const element =
              option instanceof ElementLocator ? option.query() : option
            if (!element?.isConnected)
              throw new Error(
                'Browser option element is not attached to its document.'
              )
            return { element: browserElementId(element) }
          }
        )
        await this.dispatch('selectOptions', [
          values,
          ...(options === undefined ? [] : [options]),
        ])
      },
      [value],
      options
    )
  }
  upload(files: UploadFiles, options?: UploadOptions): Promise<void> {
    return createAction(
      this,
      async () => {
        assertBrowserApiScope('browser-native')
        const values = await Promise.all(
          (Array.isArray(files) ? files : [files]).map(async (file) => {
            if (typeof file === 'string') return file
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => {
                if (typeof reader.result === 'string') resolve(reader.result)
                else
                  reject(new Error(`Failed to read upload file: ${file.name}`))
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
      },
      [files],
      options,
      true
    )
  }
  #action(
    method: ClientBrowserCommand['method'],
    args: unknown[],
    options?: unknown
  ): Promise<void> {
    return createAction(
      this,
      async (locator, values, actionOptions) => {
        await locator.dispatch(
          method,
          actionOptions === undefined ? values : [...values, actionOptions]
        )
      },
      args,
      options
    )
  }
  private async dispatch(
    method: ClientBrowserCommand['method'],
    args: unknown[]
  ) {
    await dispatchBrowserCommand(
      () => this.actionElement ?? this.query(),
      method,
      args,
      () => this.elements(),
      this.#nativeElements
    )
  }
  getByRole(...args: any[]) {
    return createQueryLocator(this, 'Role', args)
  }
  getByText(...args: any[]) {
    return createQueryLocator(this, 'Text', args)
  }
  getByLabelText(...args: any[]) {
    return createQueryLocator(this, 'LabelText', args)
  }
  getByPlaceholder(...args: any[]) {
    return createQueryLocator(this, 'PlaceholderText', args)
  }
  getByAltText(...args: any[]) {
    return createQueryLocator(this, 'AltText', args)
  }
  getByTitle(...args: any[]) {
    return createQueryLocator(this, 'Title', args)
  }
  getByTestId(...args: any[]) {
    return createQueryLocator(this, 'TestId', args)
  }
}
function createQueryLocator(
  root: Element | ElementLocator,
  name: string,
  args: unknown[]
) {
  const query = Reflect.get(queries, `queryAllBy${name}`) as Query
  if (typeof query !== 'function')
    throw new Error(`Unsupported browser query ${name}.`)
  const parent = root instanceof ElementLocator ? root.selector : ''
  const description = locatorFormatter.selector(name, args)
  return new ElementLocator(
    (native) => {
      const elements =
        root instanceof ElementLocator
          ? native
            ? nativeLocatorElements(root)
            : root.elements()
          : [root]
      return [...new Set(elements.flatMap((value) => query(value, ...args)))]
    },
    parent ? `${parent} >> ${description}` : description,
    root instanceof ElementLocator ? root.container : root
  )
}
function selectors(root: Element | ElementLocator) {
  return {
    getByRole: (...args: unknown[]) => createQueryLocator(root, 'Role', args),
    getByText: (...args: unknown[]) => createQueryLocator(root, 'Text', args),
    getByLabelText: (...args: unknown[]) =>
      createQueryLocator(root, 'LabelText', args),
    getByPlaceholder: (...args: unknown[]) =>
      createQueryLocator(root, 'PlaceholderText', args),
    getByAltText: (...args: unknown[]) =>
      createQueryLocator(root, 'AltText', args),
    getByTitle: (...args: unknown[]) => createQueryLocator(root, 'Title', args),
    getByTestId: (...args: unknown[]) =>
      createQueryLocator(root, 'TestId', args),
  }
}
const root = new ElementLocator(() => [document.body], '')
export const page = Object.assign(selectors(root), {
  elementLocator(element: Element) {
    assertBrowserApiScope('browser-native')
    if (!(element instanceof Element) || element.ownerDocument !== document)
      throw new Error('Browser locator must belong to its owned document.')
    return new ElementLocator(
      () => (element.isConnected ? [element] : []),
      element.isConnected
        ? locatorFormatter.generateSelector(element)
        : () => locatorFormatter.generateSelector(element),
      element,
      element
    )
  },
  extend(values: Record<PropertyKey, unknown>): typeof page {
    assertBrowserApiScope('declaration')
    const extended = page as Record<string, unknown>
    for (const key in values)
      extended[key] = (
        values[key] as { bind(receiver: unknown): unknown }
      ).bind(page)
    return page
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
  tab(options: { shift?: boolean } = {}): Promise<void> {
    return ensureAwaited(() =>
      dispatchBrowserCommand(() => document.body, 'tab', [options])
    )
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
    if (!internal) assertBrowserApiScope('browser-native')
    if (!unreleased.length) return
    if (!command) throw new Error('Browser element transport has closed.')
    await command({
      method: 'keyboardCleanup',
      element: `next-test-element-${nextElement++}`,
      args: [unreleased],
    })
    unreleased = []
    if (!internal) assertBrowserApiScope('browser-native')
  }
  const event = {
    ...userEventActions,
    setup() {
      assertBrowserApiScope('browser-native')
      return createUserEvent().event
    },
    cleanup: () => cleanup(),
    type(
      element: Element | ElementLocator,
      text: string,
      options?: TypeOptions
    ): Promise<void> {
      return ensureAwaited(async () => {
        const args: unknown[] = options === undefined ? [text] : [text, options]
        if (unreleased.length) args.splice(1, 2, options ?? {}, unreleased)
        const result = await dispatchBrowserCommandResult(
          () => eventLocator(element).query(),
          'type',
          args
        )
        unreleased =
          (result as { unreleased: string[] } | null)?.unreleased ?? []
      })
    },
    keyboard(text: string): Promise<void> {
      return ensureAwaited(async () => {
        const result = await dispatchBrowserCommandResult(
          () => document.body,
          'keyboard',
          unreleased.length ? [text, unreleased] : [text]
        )
        unreleased =
          (result as { unreleased: string[] } | null)?.unreleased ?? []
      })
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
    () => (value instanceof ElementLocator ? value.query() : value),
    options
  )
}
export function initializeBrowserContext(
  send: NonNullable<typeof command>,
  callbacks?: BrowserActionCallbacks
) {
  if (command || deferredCommands.size)
    throw new Error('Browser context already has an owner.')
  Object.defineProperty(globalThis, deferredLocatorKey, {
    configurable: true,
    value: resolveDeferredLocators,
  })
  command = send
  actionCallbacks = callbacks
  return {
    install() {
      // jest-dom declares assertion methods; this entry contains their raw matcher functions.
      common.expect.extend(
        domMatchers as unknown as Parameters<typeof common.expect.extend>[0]
      )
    },
    dispose() {
      command = undefined
      actionCallbacks = undefined
      releaseDeferredLocators()
    },
  }
}
/** The published component helper owns the real React roots and unmount logic. */
export async function cleanupBrowserContext() {
  const failures: unknown[] = []
  for (const cleanup of [
    () => {
      const key = Symbol.for('vitest:component-cleanup')
      if (key in page) return (page as Record<symbol, () => unknown>)[key]()
    },
    cleanupBrowserKeyboard,
    ...(deferredCommands.size ? [cleanupDeferredLocators] : []),
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
