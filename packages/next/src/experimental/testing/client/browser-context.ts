import {
  queries,
  prettyDOM as legacyPrettyDOM,
  stringify,
  domMatchers,
  createBrowserLocatorFormatter,
} from '../../../compiled/next-test-primitives/browser'
import * as common from '../vitest'
import {
  assertBrowserApiScope,
  captureAsyncScope,
  createDefaultKeyboardCleanupCall,
  createComponentCleanupCall,
  captureDefaultKeyboardCleanupCall,
  type ClientCommandAdmission,
  type OwnedBeforeWorkerInvocation,
} from './async-context'
import type {
  ClientBrowserCommand,
  ClientCommandAttemptOrigin,
} from './protocol'
import { createClientNativePromise } from './native-promise-allocation'
import type { Task } from '../runner/tasks'
import { getBrowserEnv } from './env'
import type { Locator as PlaywrightLocator, Page } from 'playwright'
import {
  registerBrowserActionIdentity,
  type BrowserActionIdentity,
} from './browser-action-identity'

export interface LocatorSelectors {
  getByRole(...args: unknown[]): ElementLocator
  getByText(...args: unknown[]): ElementLocator
  getByLabelText(...args: unknown[]): ElementLocator
  getByPlaceholder(...args: unknown[]): ElementLocator
  getByAltText(...args: unknown[]): ElementLocator
  getByTitle(...args: unknown[]): ElementLocator
  getByTestId(...args: unknown[]): ElementLocator
}
export type Locator = ElementLocator
export type BrowserPage = typeof page
export interface BrowserLocators {
  createElementLocators(element: Element): LocatorSelectors
  extend(methods: {
    [K in keyof LocatorSelectors]?: (
      this: BrowserPage | Locator,
      ...args: Parameters<LocatorSelectors[K]>
    ) => ReturnType<LocatorSelectors[K]> | string
  }): void
}

type BrowserStringifyOptions = NonNullable<Parameters<typeof stringify>[2]>
export type PrettyDOMOptions = Omit<BrowserStringifyOptions, 'maxLength'>

type Query = (...args: any[]) => Element[]
type ElementCommandMethod = Exclude<ClientBrowserCommand['method'], 'viewport'>
type DragOptions = Parameters<Page['dragAndDrop']>[2]
type ClickOptions = Parameters<PlaywrightLocator['click']>[0]
type DoubleClickOptions = Parameters<PlaywrightLocator['dblclick']>[0]
type HoverOptions = Parameters<PlaywrightLocator['hover']>[0]
type FillOptions = Parameters<PlaywrightLocator['fill']>[1]
type ClearOptions = Parameters<PlaywrightLocator['clear']>[0]
type SelectOptions = Parameters<PlaywrightLocator['selectOption']>[1]
type SelectValues =
  | string
  | string[]
  | HTMLElement
  | HTMLElement[]
  | ElementLocator
  | ElementLocator[]
type UploadOptions = Parameters<PlaywrightLocator['setInputFiles']>[1]
type UploadFiles = string | string[] | File | File[]
interface ScreenshotOptions
  extends Omit<NonNullable<Parameters<Page['screenshot']>[0]>, 'mask'> {
  element?: Element | ElementLocator
  base64?: boolean
  save?: boolean
  mask?: ReadonlyArray<Element | ElementLocator>
}
type LocatorScreenshotOptions = Omit<ScreenshotOptions, 'element'>
type ScreenshotResult = string | { path: string; base64: string }
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
      origin?: ClientCommandAttemptOrigin,
      errorSource?: Error
    ) => Promise<unknown>)
  | undefined
type BrowserActionCallbacks = {
  getConsoleTask(): Task | undefined
  captureCommandAdmission?(): ClientCommandAdmission | undefined
}
type AwaitCheckTask = Task & { onFinished?: (() => void)[] }
let actionCallbacks: BrowserActionCallbacks | undefined
let serializedClickTargets = false

class Action<T> implements Promise<T> {
  [Symbol.toStringTag] = 'Action'
  #command: (
    args: unknown[],
    options: unknown,
    errorSource: Error
  ) => Promise<T>
  #errorSource: Error
  #args: unknown[]
  #options: unknown
  #promise: Promise<T> | undefined
  #awaited = false

  constructor(
    perform: (
      args: unknown[],
      options: unknown,
      errorSource: Error
    ) => Promise<T>,
    args: unknown[],
    options: unknown,
    errorSource?: Error
  ) {
    this.#command = perform
    this.#args = args
    this.#options = options
    const sourceError = errorSource ?? new Error('STACK_TRACE_ERROR')
    this.#errorSource = sourceError
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
    return this.#command(this.#args, this.#options, this.#errorSource)
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
  options: unknown,
  errorSource?: Error
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
      (values, actionOptions, source) =>
        perform(locator, values, actionOptions, source),
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
      (values, actionOptions, source) =>
        perform(locator, values, actionOptions, source),
      args,
      options
    )
    if (new.target === UploadAction)
      registerBrowserActionIdentity(this, uploadActionIdentity)
  }
}

class ScreenshotAction extends Action<ScreenshotResult> {
  constructor(name: string, options: ScreenshotOptions) {
    super(
      async (_args, actionOptions, source) => {
        const values = actionOptions as ScreenshotOptions
        const serialized = {
          ...values,
          ...(await serializeScreenshotOptions(values)),
        }
        const { element, ...commandOptions } = serialized
        return dispatchBrowserCommandResult(
          undefined,
          'screenshot',
          [name, commandOptions],
          undefined,
          undefined,
          source,
          {
            locator: element || {
              selector: 'body',
              locator: "locator('body')",
            },
          }
        ) as Promise<ScreenshotResult>
      },
      [],
      options
    )
    if (new.target === ScreenshotAction)
      registerBrowserActionIdentity(this, screenshotActionIdentity)
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
const screenshotActionIdentity: BrowserActionIdentity = {
  prototypes: [ScreenshotAction.prototype, Action.prototype],
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
  resolveElement: (() => Element | null) | undefined,
  method: ElementCommandMethod,
  args: unknown[],
  resolveElements?: () => Element[],
  resolveNativeElements?: () => Element[],
  errorSource?: Error,
  serializedTarget?: { locator: SerializedLocator }
): Promise<void> {
  await dispatchBrowserCommandResult(
    resolveElement,
    method,
    args,
    resolveElements,
    resolveNativeElements,
    errorSource,
    serializedTarget
  )
}

async function dispatchBrowserCommandResult(
  resolveElement: (() => Element | null) | undefined,
  method: ElementCommandMethod,
  args: unknown[],
  resolveElements?: () => Element[],
  resolveNativeElements?: () => Element[],
  errorSource?: Error,
  serializedTarget?: { locator: SerializedLocator }
) {
  assertBrowserApiScope('browser-native')
  const serializedMethod =
    method === 'click' ||
    method === 'dblClick' ||
    method === 'tripleClick' ||
    method === 'hover' ||
    method === 'clear' ||
    method === 'fill' ||
    method === 'selectOptions' ||
    method === 'upload' ||
    method === 'screenshot' ||
    method === 'dragAndDrop'
      ? method
      : undefined
  if (serializedTarget && serializedMethod === undefined)
    throw new Error('Serialized Browser targets require a locator action.')
  const legacyMethod = method === 'screenshot' ? undefined : method
  if (!serializedTarget && legacyMethod === undefined)
    throw new Error('Screenshots require a serialized Browser target.')
  const admission = actionCallbacks?.captureCommandAdmission?.()
  const element = serializedTarget ? undefined : resolveElement!()
  if (
    !serializedTarget &&
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
      operation = errorSource
        ? command({ method, element: id, args }, admission?.origin, errorSource)
        : admission
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
  if (!serializedTarget && (!element || !element.isConnected))
    throw new Error('Browser element is not attached to its document.')
  if (!command) throw new Error('Browser element transport has closed.')
  const value: ClientBrowserCommand = serializedTarget
    ? { method: serializedMethod!, locator: serializedTarget.locator, args }
    : { method: legacyMethod!, element: browserElementId(element!), args }
  const operation = errorSource
    ? command(value, admission?.origin, errorSource)
    : admission
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

async function dispatchViewportCommand(
  width: number,
  height: number
): Promise<void> {
  assertBrowserApiScope('browser-native')
  if (!command) throw new Error('Browser element transport has closed.')
  const admission = actionCallbacks?.captureCommandAdmission?.()
  const value: ClientBrowserCommand = {
    method: 'viewport',
    args: [width, height],
  }
  const operation = admission
    ? command(value, admission.origin)
    : command(value)
  admission?.bind(operation)
  try {
    await operation
    if (!admission) assertBrowserApiScope('browser-native')
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

let locatorFormatter = createBrowserLocatorFormatter()
let initialBrowserTestIdAttribute = 'data-testid'
async function serializeScreenshotElement(value: Element | ElementLocator) {
  if (!value) throw new Error('Expected element or locator to be defined.')
  if (value instanceof Element) return locatorFormatter.serializeElement(value)
  if (typeof value === 'object' && locatorBrand in value)
    return value.serialize()
  throw new Error(
    'Expected element or locator to be an instance of Element or Locator.'
  )
}

async function serializeScreenshotOptions(options: ScreenshotOptions) {
  const [element, ...mask] = await Promise.all([
    options.element ? serializeScreenshotElement(options.element) : undefined,
    ...('mask' in options
      ? options.mask!.map((value) => serializeScreenshotElement(value))
      : []),
  ])
  return 'mask' in options ? { element, mask } : { element }
}

const screenshotIds: Record<number, Record<string, number>> = {}
function screenshotTaskName(task: Task): string {
  return task.suite
    ? `${screenshotTaskName(task.suite)} ${task.name}`
    : task.name
}

function screenshot(
  options: Omit<ScreenshotOptions, 'save'> & { save: false }
): Promise<string>
function screenshot(
  options: Omit<ScreenshotOptions, 'base64'> & { base64: true }
): Promise<{ path: string; base64: string }>
function screenshot(
  options?: Omit<ScreenshotOptions, 'base64'>
): Promise<string>
function screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult>
function screenshot(
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const currentTest = actionCallbacks?.getConsoleTask()
  if (!currentTest)
    throw new Error('Cannot take a screenshot outside of a test.')
  if (currentTest.concurrent)
    throw new Error(
      'Cannot take a screenshot in a concurrent test because ' +
        "concurrent tests run at the same time in the same iframe and affect each other's environment. " +
        'Use a non-concurrent test to take a screenshot.'
    )
  const repeatCount = currentTest.result?.repeatCount ?? 0
  const taskName = screenshotTaskName(currentTest)
  const number = screenshotIds[repeatCount]?.[taskName] ?? 1
  screenshotIds[repeatCount] ??= {}
  screenshotIds[repeatCount][taskName] = number + 1
  const name =
    options.path || `${taskName.replace(/[^a-z0-9]/gi, '-')}-${number}.png`
  return new ScreenshotAction(name, options)
}
let nativeLocatorElements: (locator: ElementLocator) => Element[]

interface SerializedLocator {
  selector: string
  locator: string
}

interface LocatorCache {
  _pwSelector?: string
  _pwLocator?: string
}

export interface LocatorFilterOptions {
  hasText?: string | RegExp
  hasNotText?: string | RegExp
  has?: ElementLocator
  hasNot?: ElementLocator
}

const locatorBrand = Symbol.for('$$vitest:locator')

/** Queries execute in the actual document. Input commands stay Playwright-owned. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- locators.extend installs augmented methods on this prototype.
interface ElementLocator extends LocatorSelectors {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- The private class intentionally retains declared selector augmentation.
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
    Object.defineProperty(this, locatorBrand, {
      enumerable: false,
      writable: false,
      configurable: false,
      value: locatorBrand,
    })
    this.#nativeElements = () => resolve(true)
  }
  get selector(): string {
    return typeof this.description === 'function'
      ? this.description()
      : this.description
  }
  toString(): string {
    return this.selector
  }
  asLocator(): string {
    const cache = this as this & LocatorCache
    return (cache._pwLocator ||= locatorFormatter.asLocator(
      cache._pwSelector || this.selector
    ))
  }
  serialize(): SerializedLocator {
    const cache = this as this & LocatorCache
    const value = {
      selector: this.selector,
      locator: this.asLocator(),
      _pwSelector: cache._pwSelector,
    }
    return value
  }
  toJSON(): SerializedLocator {
    return this.serialize()
  }
  filter(filter: LocatorFilterOptions): ElementLocator {
    const filters: string[] = []
    if (filter?.hasText)
      filters.push(
        `internal:has-text=${locatorFormatter.filterText(filter.hasText)}`
      )
    if (filter?.hasNotText)
      filters.push(
        `internal:has-not-text=${locatorFormatter.filterText(filter.hasNotText)}`
      )
    if (filter?.has) {
      const locator = filter.has as ElementLocator & LocatorCache
      filters.push(
        `internal:has=${JSON.stringify(locator._pwSelector || locator.selector)}`
      )
    }
    if (filter?.hasNot) {
      const locator = filter.hasNot as ElementLocator & LocatorCache
      filters.push(
        `internal:has-not=${JSON.stringify(locator._pwSelector || locator.selector)}`
      )
    }
    if (!filters.length)
      throw new Error(
        'Locator.filter expects at least one filter. None provided.'
      )
    return this.locator(filters.join(' >> '))
  }
  protected locator(selector: string): ElementLocator {
    const description = `${this.selector} >> ${selector}`
    let child: ElementLocator
    child = new ElementLocator(
      locatorFormatter.createQuery(() => {
        const locator = child as ElementLocator & LocatorCache
        return locator._pwSelector || locator.selector
      }),
      description,
      this.container
    )
    return child
  }
  protected elementLocator(element: Element): ElementLocator {
    const description = locatorFormatter.generateSelector(element)
    let locator: ElementLocator
    locator = new ElementLocator(
      locatorFormatter.createQuery(() => {
        const cache = locator as ElementLocator & LocatorCache
        return cache._pwSelector || locator.selector
      }),
      description,
      element
    )
    return locator
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
    return this.#action(
      'click',
      [],
      options,
      serializedClickTargets ? { locator: this.serialize() } : undefined
    )
  }
  dblClick(options?: DoubleClickOptions): Promise<void> {
    return this.#action(
      'dblClick',
      [],
      options,
      serializedClickTargets ? { locator: this.serialize() } : undefined
    )
  }
  tripleClick(options?: ClickOptions): Promise<void> {
    return this.#action(
      'tripleClick',
      [],
      options,
      serializedClickTargets ? { locator: this.serialize() } : undefined
    )
  }
  unhover(options?: HoverOptions): Promise<void> {
    if (serializedClickTargets)
      return this.action('__vitest_hover', [], options, {
        selector: 'html > body',
        locator: "locator('body')",
      })
    return this.#action('unhover', [], options)
  }
  hover(options?: HoverOptions): Promise<void> {
    return this.#action(
      'hover',
      [],
      options,
      serializedClickTargets ? { locator: this.serialize() } : undefined
    )
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
    if (serializedClickTargets)
      return this.action(
        '__vitest_dragAndDrop',
        [target.toJSON()],
        options === undefined ? {} : options,
        this.toJSON()
      )
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
    return this.#action(
      'fill',
      [value],
      options,
      serializedClickTargets ? { locator: this.serialize() } : undefined
    )
  }
  clear(options?: ClearOptions): Promise<void> {
    return this.#action(
      'clear',
      [],
      options,
      serializedClickTargets ? { locator: this.serialize() } : undefined
    )
  }
  selectOptions(value: SelectValues, options?: SelectOptions): Promise<void> {
    if (serializedClickTargets) {
      const values = (Array.isArray(value) ? value : [value]).map((option) =>
        typeof option === 'string'
          ? option
          : {
              element:
                option && typeof option === 'object' && locatorBrand in option
                  ? (option as ElementLocator).serialize()
                  : locatorFormatter.serializeElement(option as Element),
            }
      )
      return this.#action('selectOptions', [values], options, {
        locator: this.serialize(),
      })
    }
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
    const serializedTarget = serializedClickTargets
      ? { locator: this.serialize() }
      : undefined
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
        await this.dispatch(
          'upload',
          [values, ...(options === undefined ? [] : [options])],
          undefined,
          serializedTarget
        )
      },
      [files],
      options,
      true
    )
  }
  screenshot(
    options: Omit<LocatorScreenshotOptions, 'base64'> & { base64: true }
  ): Promise<{ path: string; base64: string }>
  screenshot(options?: LocatorScreenshotOptions): Promise<string>
  screenshot(options?: LocatorScreenshotOptions): Promise<ScreenshotResult> {
    return page.screenshot({ ...options, element: this })
  }
  #action(
    method: ElementCommandMethod,
    args: unknown[],
    options?: unknown,
    serializedTarget?: { locator: SerializedLocator }
  ): Promise<void> {
    return createAction(
      this,
      async (locator, values, actionOptions, errorSource) => {
        await locator.dispatch(
          method,
          actionOptions === undefined ? values : [...values, actionOptions],
          errorSource,
          serializedTarget
        )
      },
      args,
      options
    )
  }
  private async dispatch(
    method: ElementCommandMethod,
    args: unknown[],
    errorSource?: Error,
    serializedTarget?: { locator: SerializedLocator }
  ) {
    await dispatchBrowserCommand(
      () => this.actionElement ?? this.query(),
      method,
      args,
      () => this.elements(),
      this.#nativeElements,
      errorSource,
      serializedTarget
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
  private action(
    method: '__vitest_hover' | '__vitest_dragAndDrop',
    args: unknown[],
    options?: HoverOptions | DragOptions,
    locator: SerializedLocator = this.serialize()
  ): Promise<void> {
    if (method !== '__vitest_hover' && method !== '__vitest_dragAndDrop')
      throw new Error('Unsupported Browser locator action.')
    const nativeMethod = method === '__vitest_hover' ? 'hover' : 'dragAndDrop'
    const errorSource = (this as ElementLocator & { _errorSource?: Error })
      ._errorSource
    const work: LocatorWork<void> = async (
      _receiver,
      values,
      actionOptions,
      source
    ) => {
      await dispatchBrowserCommand(
        undefined,
        nativeMethod,
        actionOptions === undefined ? values : [...values, actionOptions],
        undefined,
        undefined,
        source,
        { locator }
      )
    }
    return actionCallbacks
      ? new LocatorAction(work, this, args, options, errorSource)
      : work(this, args, options, errorSource)
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
  const testIdDescription =
    name === 'TestId'
      ? locatorFormatter.testIdSelector(
          server.config.browser.locators.testIdAttribute,
          args[0]
        )
      : undefined
  const parent = root instanceof ElementLocator ? root.selector : ''
  const description = testIdDescription ?? locatorFormatter.selector(name, args)
  if (serializedClickTargets) {
    let locator: ElementLocator
    locator = new ElementLocator(
      locatorFormatter.createQuery(() => {
        const cache = locator as ElementLocator & LocatorCache
        return cache._pwSelector || locator.selector
      }),
      parent ? `${parent} >> ${description}` : description,
      root instanceof ElementLocator ? root.container : root
    )
    return locator
  }
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
function createCustomQueryLocator(selector: string): ElementLocator {
  let locator: ElementLocator
  locator = new ElementLocator(
    locatorFormatter.createQuery(() => {
      const cache = locator as ElementLocator & LocatorCache
      return cache._pwSelector || locator.selector
    }),
    selector
  )
  return locator
}
const extendedLocatorMethods = new Set<string>()
const root = new ElementLocator(() => [document.body], '')
export const page = Object.assign(
  selectors(root) as ReturnType<typeof selectors> & LocatorSelectors,
  {
    viewport(width: number, height: number): Promise<void> {
      const operation = dispatchViewportCommand(width, height)
      return createClientNativePromise(Promise, (resolve, reject) => {
        void operation.then(resolve, reject)
      })
    },
    screenshot,
    elementLocator(element: Element) {
      assertBrowserApiScope('browser-native')
      if (!(element instanceof Element) || element.ownerDocument !== document)
        throw new Error('Browser locator must belong to its owned document.')
      return new ElementLocator(
        () => (element.isConnected ? [element] : []),
        serializedClickTargets || element.isConnected
          ? locatorFormatter.generateSelector(element)
          : () => locatorFormatter.generateSelector(element),
        element,
        element
      )
    },
    extend(values: Record<PropertyKey, unknown>): typeof page {
      assertBrowserApiScope('declaration')
      const extended = page as unknown as Record<string, unknown>
      for (const key in values)
        extended[key] = (
          values[key] as { bind(receiver: unknown): unknown }
        ).bind(page)
      return page
    },
  }
)
export const locators: BrowserLocators = {
  createElementLocators: getElementLocatorSelectors,
  extend(methods) {
    const Locator = createCustomQueryLocator('css=body').constructor as {
      prototype: Record<string, unknown>
    }
    for (const method in methods) {
      extendedLocatorMethods.add(method)
      const cb = (methods as Record<string, (...args: any[]) => any>)[method]
      Locator.prototype[method] = function (
        this: { locator(selector: string): ElementLocator },
        ...args: unknown[]
      ) {
        const selectorOrLocator = cb.call(this, ...args)
        if (typeof selectorOrLocator === 'string')
          return this.locator(selectorOrLocator)
        return selectorOrLocator
      }
      ;(page as unknown as Record<string, unknown>)[method] = function (
        this: unknown,
        ...args: unknown[]
      ) {
        const selectorOrLocator = cb.call(this, ...args)
        if (typeof selectorOrLocator === 'string')
          return createCustomQueryLocator(selectorOrLocator)
        return selectorOrLocator
      }
    }
  },
}
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
    const defaultCleanup = internal
      ? undefined
      : captureDefaultKeyboardCleanupCall(event)
    if (!internal && !defaultCleanup) assertBrowserApiScope('browser-native')
    if (!unreleased.length) return
    if (!command) throw new Error('Browser element transport has closed.')
    await command({
      method: 'keyboardCleanup',
      element: `next-test-element-${nextElement++}`,
      args: [unreleased],
    })
    unreleased = []
    if (defaultCleanup) defaultCleanup()
    else if (!internal) assertBrowserApiScope('browser-native')
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
type KeyboardCleanupOutcome<T> =
  | Readonly<{ status: 'fulfilled' }>
  | Readonly<{
      status: 'rejected'
      error: unknown
      ownership?: 'cleanup' | 'call'
      captured?: Readonly<{ value: T }>
    }>
export type BrowserContextCleanupFailure = Readonly<{
  error: unknown
  component: Readonly<{ error: unknown }>
  keyboard: Extract<KeyboardCleanupOutcome<unknown>, { status: 'rejected' }>
}>
type KeyboardCleanupObservation<T> = {
  captureKeyboardError?(error: unknown): T
  onKeyboardCleanup?(outcome: KeyboardCleanupOutcome<T>): void
}
/** Only the default resource's actual public invocation receives this lease. */
export async function cleanupBrowserKeyboard<T>(
  options?: {
    beforeAttempt?: boolean
    nativeInvocation?: OwnedBeforeWorkerInvocation
    observation?: KeyboardCleanupObservation<T>
  },
  observeOutcome?: (outcome: KeyboardCleanupOutcome<T>) => void
) {
  const call = createDefaultKeyboardCleanupCall(
    userEvent,
    options?.nativeInvocation
  )
  const failures: unknown[] = []
  const captureFailures: unknown[] = []
  const caught: { error: unknown; captured?: Readonly<{ value: T }> }[] = []
  let returned: unknown, followup: unknown
  let returnedCalled = false,
    followupCalled = false
  let returnedOutcome: Awaited<ReturnType<typeof call.settle>> | undefined
  let followupOutcome: Awaited<ReturnType<typeof call.settle>> | undefined
  try {
    try {
      call.run(() => {
        // Member retrieval precedes invocation and uses the actual public receiver.
        returned = userEvent.cleanup()
        returnedCalled = true
        if (options?.beforeAttempt) return
        // Keep the pinned .catch expression boundary distinct from a returned rejection.
        followup = (returned as Promise<unknown>).catch((error: unknown) =>
          call.run(() => {
            const occurrence: {
              error: unknown
              captured?: Readonly<{ value: T }>
            } = { error }
            caught.push(occurrence)
            try {
              const capture = options?.observation?.captureKeyboardError
              if (capture)
                occurrence.captured = Object.freeze({
                  value: capture.call(options?.observation, error),
                })
            } catch (observerError) {
              captureFailures.push(observerError)
            }
          })
        )
        followupCalled = true
      })
    } catch (error) {
      failures.push(error)
    }
    // A bad .catch member does not abandon a real operation already returned.
    const returnedJoin = returnedCalled ? call.settle(returned) : undefined
    const followupJoin = followupCalled ? call.settle(followup) : undefined
    if (returnedJoin) returnedOutcome = await returnedJoin
    if (followupJoin) followupOutcome = await followupJoin
    let outcome: KeyboardCleanupOutcome<T> = Object.freeze({
      status: 'fulfilled',
    })
    if (returnedOutcome?.status === 'rejected') {
      const ownsRejection =
        !options?.beforeAttempt &&
        !failures.length &&
        !captureFailures.length &&
        caught.length === 1 &&
        caught[0].error === returnedOutcome.error &&
        followupOutcome?.status === 'fulfilled'
      outcome = Object.freeze({
        status: 'rejected',
        error: returnedOutcome.error,
        ownership: ownsRejection ? ('cleanup' as const) : ('call' as const),
        ...(ownsRejection && caught[0].captured
          ? { captured: caught[0].captured }
          : {}),
      })
      failures.push(returnedOutcome.error)
    } else if (failures.length) {
      outcome = Object.freeze({
        status: 'rejected',
        error: failures[0],
        ownership: 'call' as const,
      })
    }
    if (
      caught.length &&
      !(
        caught.length === 1 &&
        returnedOutcome?.status === 'rejected' &&
        caught[0].error === returnedOutcome.error
      )
    )
      failures.push(...caught.map(({ error }) => error))
    failures.push(...captureFailures)
    if (followupOutcome?.status === 'rejected')
      failures.push(followupOutcome.error)
    if (!options?.beforeAttempt) {
      try {
        observeOutcome?.(outcome)
      } catch (observerError) {
        failures.push(observerError)
      }
      try {
        call.run(() => options?.observation?.onKeyboardCleanup?.(outcome))
      } catch (observerError) {
        failures.push(observerError)
      }
    }
  } finally {
    call.close()
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length)
    throw new AggregateError(failures, 'Browser keyboard cleanup failed.')
}

interface BrowserServerConfiguration {
  browser: {
    locators: {
      testIdAttribute: string
      errorFormat: 'html' | 'aria' | 'all'
    }
  }
}
function createBrowserConfiguration(
  errorFormat: unknown,
  testIdAttribute = 'data-testid'
) {
  return {
    browser: { locators: { testIdAttribute, errorFormat } },
  }
}
let browserConfiguration = createBrowserConfiguration('all')
export const server = {
  config: browserConfiguration as BrowserServerConfiguration,
}
function getElementLocatorSelectors(
  element: Element | ElementLocator
): LocatorSelectors {
  if (!serializedClickTargets) return selectors(element)
  const locator = page.elementLocator(element as Element)
  return {
    getByAltText: (altText: unknown, options?: unknown) =>
      locator.getByAltText(altText, options),
    getByLabelText: (labelText: unknown, options?: unknown) =>
      locator.getByLabelText(labelText, options),
    getByPlaceholder: (placeholderText: unknown, options?: unknown) =>
      locator.getByPlaceholder(placeholderText, options),
    getByRole: (role: unknown, options?: unknown) =>
      locator.getByRole(role, options),
    getByTestId: (testId: unknown) => locator.getByTestId(testId),
    getByText: (text: unknown, options?: unknown) =>
      locator.getByText(text, options),
    getByTitle: (title: unknown, options?: unknown) =>
      locator.getByTitle(title, options),
    ...Array.from(extendedLocatorMethods).reduce<
      Record<string, (...args: unknown[]) => ElementLocator>
    >((methods, method) => {
      methods[method] = (...args) =>
        (
          locator as unknown as Record<
            string,
            (...args: unknown[]) => ElementLocator
          >
        )[method](...args)
      return methods
    }, {}),
  }
}
let defaultPrettyDOMOptions: BrowserStringifyOptions | undefined
function prettyDOM(
  dom?: Element | ElementLocator | null,
  maxLength = Number(
    defaultPrettyDOMOptions?.maxLength ??
      getBrowserEnv({}).DEBUG_PRINT_LIMIT ??
      7000
  ),
  prettyFormatOptions: PrettyDOMOptions = {}
): string {
  if (maxLength === 0) return ''
  if (!dom) dom = document.body
  if ('element' in dom && 'all' in dom) dom = dom.element()
  const type = typeof dom
  if (type !== 'object' || !(dom as Element).outerHTML) {
    const typeName = type === 'object' ? dom.constructor.name : type
    throw new TypeError(`Expecting a valid DOM element, but got ${typeName}.`)
  }
  const pretty = stringify(dom, Number.POSITIVE_INFINITY, {
    maxLength,
    highlight: true,
    ...defaultPrettyDOMOptions,
    ...prettyFormatOptions,
  })
  return (dom as Element).outerHTML.length > maxLength
    ? `${pretty.slice(0, maxLength)}...`
    : pretty
}
function configurePrettyDOM(options: BrowserStringifyOptions): void {
  defaultPrettyDOMOptions = options
}
function getElementError(
  selector: string | ElementLocator,
  container?: Element
): Error {
  const locator =
    typeof selector === 'string'
      ? locatorFormatter.asLocator(selector)
      : selector.asLocator()
  const format = browserConfiguration.browser.locators.errorFormat
  const formatted =
    format === 'aria'
      ? `ARIA tree:\n${locatorFormatter.formatAriaTree(container as Element)}`
      : format === 'all'
        ? `ARIA tree:\n${locatorFormatter.formatAriaTree(container as Element)}\n\nHTML:\n${prettyDOM(container)}`
        : prettyDOM(container)
  const error = new Error(
    `Cannot find element with locator: ${locator}\n\n${formatted}`
  )
  error.name = 'VitestBrowserElementError'
  return error
}
export const utils = {
  getElementError,
  getElementLocatorSelectors,
  prettyDOM,
  configurePrettyDOM,
  debug(
    element:
      | Element
      | ElementLocator
      | null
      | Array<Element | ElementLocator> = document.body,
    maxLength?: number,
    options?: PrettyDOMOptions
  ) {
    assertBrowserApiScope('utility')
    if (!serializedClickTargets) {
      console.log(
        legacyPrettyDOM(element as Element, maxLength, options as any)
      )
      return
    }
    if (Array.isArray(element))
      element.forEach((value) =>
        console.log(prettyDOM(value, maxLength, options))
      )
    else console.log(prettyDOM(element, maxLength, options))
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
  callbacks?: BrowserActionCallbacks,
  transport?: { serializedClickTargets?: true },
  configuration?: {
    browserLocatorErrorFormat?: unknown
    browserLocatorTestIdAttribute?: string
  }
) {
  if (command || deferredCommands.size)
    throw new Error('Browser context already has an owner.')
  const previousConfiguration = browserConfiguration
  const previousLocatorFormatter = locatorFormatter
  const previousTestIdAttribute = initialBrowserTestIdAttribute
  const previousPublicConfig = Object.getOwnPropertyDescriptor(
    server,
    'config'
  )!
  initialBrowserTestIdAttribute =
    configuration?.browserLocatorTestIdAttribute === undefined
      ? 'data-testid'
      : configuration.browserLocatorTestIdAttribute
  locatorFormatter = createBrowserLocatorFormatter({
    testIdAttribute: initialBrowserTestIdAttribute,
  })
  browserConfiguration = createBrowserConfiguration(
    configuration === undefined
      ? 'all'
      : configuration.browserLocatorErrorFormat,
    initialBrowserTestIdAttribute
  )
  Object.defineProperty(server, 'config', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: browserConfiguration,
  })
  Object.defineProperty(globalThis, deferredLocatorKey, {
    configurable: true,
    value: resolveDeferredLocators,
  })
  command = send
  actionCallbacks = callbacks
  serializedClickTargets = transport?.serializedClickTargets === true
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
      serializedClickTargets = false
      browserConfiguration = previousConfiguration
      createBrowserLocatorFormatter({
        testIdAttribute: previousTestIdAttribute,
      })
      initialBrowserTestIdAttribute = previousTestIdAttribute
      locatorFormatter = previousLocatorFormatter
      Object.defineProperty(server, 'config', previousPublicConfig)
      releaseDeferredLocators()
    },
  }
}
/** The published component helper owns the real React roots and unmount logic. */
export async function cleanupBrowserContext<T>(
  observation?: KeyboardCleanupObservation<T> & {
    nativeInvocation?: OwnedBeforeWorkerInvocation
    onComponentFailure?(occurrence: Readonly<{ error: unknown }>): void
    onContextCleanupFailure?(occurrence: BrowserContextCleanupFailure): void
  }
) {
  const failures: unknown[] = []
  let componentFailure: Readonly<{ error: unknown }> | undefined
  let keyboardOutcome: KeyboardCleanupOutcome<T> | undefined
  let componentCall: ReturnType<typeof createComponentCleanupCall>
  const componentCleanup = () => {
    const key = Symbol.for('vitest:component-cleanup')
    if (key in page) {
      componentCall = observation?.nativeInvocation
        ? createComponentCleanupCall?.(page, observation.nativeInvocation)
        : undefined
      const invoke = () => (page as Record<symbol, () => unknown>)[key]()
      return componentCall ? componentCall.run(invoke) : invoke()
    }
  }
  const keyboardCleanup = () =>
    cleanupBrowserKeyboard(
      {
        nativeInvocation: observation?.nativeInvocation,
        observation,
      },
      (outcome) => {
        keyboardOutcome = outcome
      }
    )
  for (const cleanup of [
    componentCleanup,
    keyboardCleanup,
    ...(deferredCommands.size ? [cleanupDeferredLocators] : []),
  ]) {
    if (typeof cleanup !== 'function') continue
    try {
      const returned = cleanup()
      if (cleanup === componentCleanup && componentCall) {
        const outcome = await componentCall.settle(returned)
        if (outcome.status === 'rejected') throw outcome.error
      } else await returned
    } catch (error) {
      failures.push(error)
      if (cleanup === componentCleanup) {
        const occurrence = Object.freeze({ error })
        componentFailure = occurrence
        try {
          const observer = observation?.onComponentFailure
          if (observer != null) {
            const observe = () =>
              Reflect.apply(observer, observation, [occurrence])
            await (componentCall ? componentCall.run(observe) : observe())
          }
        } catch (observerError) {
          failures.push(observerError)
        }
      }
    } finally {
      if (cleanup === componentCleanup) componentCall?.close()
    }
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length) {
    const error = new AggregateError(
      failures,
      'Browser context cleanup failed.'
    )
    if (
      failures.length === 2 &&
      componentFailure &&
      keyboardOutcome?.status === 'rejected' &&
      keyboardOutcome.ownership === 'cleanup' &&
      Object.is(failures[0], componentFailure.error) &&
      Object.is(failures[1], keyboardOutcome.error)
    ) {
      try {
        observation?.onContextCleanupFailure?.(
          Object.freeze({
            error,
            component: componentFailure,
            keyboard: keyboardOutcome,
          })
        )
      } catch (observerError) {
        throw new AggregateError(
          [...failures, observerError],
          'Browser context cleanup failed.'
        )
      }
    }
    throw error
  }
}
