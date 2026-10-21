import type {
  TaskMeta,
  Test,
  TestAnnotation,
  TestAttachment,
  TestTag,
  TestTagDefinition,
  Suite,
} from './tasks'
import type { TestExpect } from '../assertions'
import type { ProvidedContext } from '../vitest'
import type { TestError } from '../../../compiled/next-test-primitives'
import {
  configureFixtureCallback,
  normalizeFixtureArguments,
  resolveFixtureDefinitions,
  extendFixtures,
  validateFixtureDefinitions,
} from './fixtures'
import type {
  FixtureDefinitions,
  FixtureOptions,
  BuilderFixtureFn,
} from './fixtures'
import { assertScopeActive } from './async-context'
import {
  formatWithOptions,
  inspect,
  createDeclarationStorage,
} from './collector-platform'
import { shuffleTests, type TestSequenceOptions } from './sequence'

const fixtureBuilderReceiver = Symbol('fixture builder receiver')
type FixtureBuilderArguments = [unknown, unknown?, unknown?]
type FixtureBuilderOperations = {
  extend(...args: FixtureBuilderArguments): TestDeclaration
  override(...args: FixtureBuilderArguments): void
}

function fixtureBuilderOperations(receiver: unknown): FixtureBuilderOperations {
  const owner =
    receiver == null
      ? undefined
      : (Reflect.get(Object(receiver), fixtureBuilderReceiver) as {
          getFixtures(): FixtureBuilderOperations
        })
  return owner!.getFixtures()
}

export type TestMode = 'run' | 'skip' | 'todo' | 'only'
export type HookName = 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach'
export type AroundHookName = 'aroundEach' | 'aroundAll'
export type Cleanup = () => void | Promise<void>

export interface TestContext {
  inject<Key extends keyof ProvidedContext & string>(
    key: Key
  ): ProvidedContext[Key]
  readonly task: Readonly<Test>
  readonly expect: TestExpect
  annotate(
    message: string,
    type?: string,
    attachment?: TestAttachment
  ): Promise<TestAnnotation>
  annotate(
    message: string,
    attachment?: TestAttachment
  ): Promise<TestAnnotation>
  bench(name: string, fn: () => unknown, options?: object): never
  skip(note?: string): never
  skip(condition: boolean, note?: string): void
  readonly signal: AbortSignal
  onTestFinished(handler: OnTestFinishedHandler, timeout?: number): void
  onTestFailed(handler: OnTestFailedHandler, timeout?: number): void
}

export type OnTestFinishedHandler = (
  context: TestContext
) => void | PromiseLike<void>
export type OnTestFailedHandler = (
  context: TestContext
) => void | PromiseLike<void>

// The collector executes internal callbacks and ignores their resolved values.
// Public declarations retain the target's narrower listener return contract.
export type InternalTestContext = Omit<
  TestContext,
  'onTestFinished' | 'onTestFailed'
> & {
  onTestFinished(handler: TestBody, timeout?: number): void
  onTestFailed(handler: TestBody, timeout?: number): void
}
export type TestBody = (
  context: InternalTestContext
) => unknown | Promise<unknown>
export type AroundEachBody<
  T extends object = {},
  Context extends object = TestContext,
> = (
  runTest: () => Promise<void>,
  context: Context & T,
  suite: Readonly<Suite>
) => unknown | Promise<unknown>
export type AroundAllBody<T extends object = {}> = (
  runSuite: () => Promise<void>,
  context: T,
  suite: Readonly<Suite>
) => unknown | Promise<unknown>
export type AroundHook = {
  readonly registrationErrors?: Readonly<Record<'setup' | 'teardown', Error>>
  fn: AroundEachBody | AroundAllBody
  fixtures: FixtureDefinitions
  timeout?: number
}
export type Hook = {
  readonly registrationError?: Error
  fn: TestBody
  timeout?: number
  fixtures?: FixtureDefinitions
}

export interface TestOptions {
  tags?: TestTag | TestTag[]
  meta?: Partial<TaskMeta>
  retry?:
    | number
    | {
        count?: number
        delay?: number
        condition?: RegExp | ((error: TestError) => boolean)
      }
  timeout?: number
  repeats?: number
  fails?: boolean
  concurrent?: boolean
  skip?: boolean
  only?: boolean
  todo?: boolean
}

export interface SuiteOptions extends TestOptions {
  shuffle?: boolean
}

export interface TestCase {
  /** Actual declaration stack; kept off the public task and enumerable data. */
  readonly registrationError?: Error
  type: 'test'
  meta: TaskMeta
  tags: string[]
  id: string
  name: string
  mode: TestMode
  suite: TestSuite
  options: TestOptions
  fn?: TestBody
  fixtures: FixtureDefinitions
}

export interface TestSuite {
  type: 'suite'
  meta: TaskMeta
  tags: string[]
  id: string
  name: string
  mode: TestMode
  suite?: TestSuite
  children: (TestCase | TestSuite)[]
  hooks: Record<HookName, Hook[]>
  around: Record<AroundHookName, AroundHook[]>
  options: SuiteOptions
  fixtureOverrides: Map<FixtureDefinitions, FixtureDefinitions>
}

type Name = string | Function
type EachCallback<T extends readonly unknown[]> = (...items: T) => unknown
type EachDeclaration<T extends readonly unknown[], Options = TestOptions> = {
  (name: Name, fn: EachCallback<T>, timeout?: number): void
  (name: Name, options: Options, fn: EachCallback<T>): void
}
type ForDeclaration<
  T,
  C extends object,
  Context extends object = TestContext,
> = {
  (name: Name, fn: (item: T, context: Context & C) => unknown): void
  (
    name: Name,
    options: TestOptions,
    fn: (item: T, context: Context & C) => unknown
  ): void
}

export function unsupported(api: string): never {
  throw new Error(`Next testing does not support ${api} yet.`)
}

type ScopeValues<T> = [Exclude<T, undefined>] extends [never]
  ? {}
  : Exclude<T, undefined>
type ScopeMarker<T, K extends PropertyKey> = K extends keyof T
  ? Extract<NonNullable<T[K]>, object>
  : {}
type WorkerBuilderContext<T> = ScopeMarker<T, '$__worker'>
type FileBuilderContext<T> = WorkerBuilderContext<T> & ScopeMarker<T, '$__file'>
type FileFixtureContext<T> = '$__file' extends keyof T
  ? FileBuilderContext<T>
  : '$__worker' extends keyof T
    ? FileBuilderContext<T>
    : T
type AddBuilderFixture<
  T,
  K extends string,
  V,
  S extends 'test' | 'file' | 'worker',
> = Omit<T, K | '$__file' | '$__test' | '$__worker'> &
  Record<K, V> & {
    readonly $__worker?: ScopeMarker<T, '$__worker'> &
      (S extends 'worker' ? Record<K, V> : {})
    readonly $__file?: ScopeMarker<T, '$__file'> &
      (S extends 'file' ? Record<K, V> : {})
    readonly $__test?: ScopeMarker<T, '$__test'> &
      (S extends 'test' ? Record<K, V> : {})
  }
interface ScopedFixturesDefinition {
  $test?: Record<string, unknown>
  $file?: Record<string, unknown>
  $worker?: Record<string, unknown>
}
type ScopedFixtureValues<E extends ScopedFixturesDefinition> = ScopeValues<
  E['$test']
> &
  ScopeValues<E['$file']> &
  ScopeValues<E['$worker']>
type FixtureFactory<V, C> = (
  context: C,
  use: (value: V) => Promise<void>
) => Promise<void>
// The reverse callable check preserves the pinned constructor and branded-value cases.
type FixtureValue<E, K extends keyof E, C> = ((
  ...args: any[]
) => any) extends E[K]
  ? E[K] extends any
    ? FixtureFactory<E[K], C>
    : never
  : E[K] | (E[K] extends any ? FixtureFactory<E[K], C> : never)
type ObjectFixtureContext<
  E,
  T,
  K extends keyof E,
  Context extends object,
> = Context & Omit<E, K> & Omit<T, Exclude<keyof E, K>>
type ObjectFixtures<
  E extends object,
  T extends object,
  Context extends object = TestContext,
> = {
  [K in keyof E]:
    | FixtureValue<E, K, ObjectFixtureContext<E, T, K, Context>>
    | [
        FixtureValue<E, K, ObjectFixtureContext<E, T, K, Context>>,
        FixtureOptions,
      ]
}
type FlattenFixtureContext<T> = { [Key in keyof T]: T[Key] }
type ScopedFixtures<
  E extends ScopedFixturesDefinition,
  T extends object,
  Context extends object = TestContext,
> = {
  [K in keyof NonNullable<E['$test']>]:
    | NonNullable<E['$test']>[K]
    | FixtureFactory<
        NonNullable<E['$test']>[K],
        Context & T & ScopedFixtureValues<E>
      >
    | [
        FixtureFactory<
          NonNullable<E['$test']>[K],
          Context & T & ScopedFixtureValues<E>
        >,
        FixtureOptions & { scope?: 'test' },
      ]
} & {
  [K in keyof NonNullable<E['$file']>]: [
    FixtureFactory<
      NonNullable<E['$file']>[K],
      T & ScopeValues<E['$file']> & ScopeValues<E['$worker']>
    >,
    FixtureOptions & { scope: 'file' },
  ]
} & {
  [K in keyof NonNullable<E['$worker']>]: [
    FixtureFactory<NonNullable<E['$worker']>[K], T & ScopeValues<E['$worker']>>,
    FixtureOptions & { scope: 'worker' },
  ]
}

export interface TestDeclaration<
  T extends object = {},
  Context extends object = TestContext,
> {
  describe: SuiteDeclaration<Context>
  suite: SuiteDeclaration<Context>
  beforeEach(
    fn: (context: Context & T, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  afterEach(
    fn: (context: Context & T, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  beforeAll(
    fn: (context: FileFixtureContext<T>, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  afterAll(
    fn: (context: FileFixtureContext<T>, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  aroundEach(fn: AroundEachBody<T, Context>, timeout?: number): void
  aroundAll(fn: AroundAllBody<FileFixtureContext<T>>, timeout?: number): void
  (name: Name, fn: (context: Context & T) => unknown, timeout?: number): void
  (
    name: Name,
    options: TestOptions,
    fn: (context: Context & T) => unknown
  ): void
  (name: Name): void
  readonly skip: TestDeclaration<T, Context>
  readonly only: TestDeclaration<T, Context>
  readonly todo: TestDeclaration<T, Context>
  readonly concurrent: TestDeclaration<T, Context>
  readonly fails: TestDeclaration<T, Context>
  each<C extends readonly unknown[]>(cases: readonly C[]): EachDeclaration<C>
  each<C>(cases: readonly C[]): EachDeclaration<[C]>
  each(strings: TemplateStringsArray, ...values: any[]): EachDeclaration<any[]>
  for<C>(cases: readonly C[]): ForDeclaration<C, T, Context>
  for(
    strings: TemplateStringsArray,
    ...values: any[]
  ): ForDeclaration<any, T, Context>
  skipIf(condition: unknown): TestDeclaration<T, Context>
  runIf(condition: unknown): TestDeclaration<T, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    fn: BuilderFixtureFn<V, Context & T>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'worker' },
    fn: BuilderFixtureFn<V, WorkerBuilderContext<T>>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'worker'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'file' },
    fn: BuilderFixtureFn<V, FileBuilderContext<T>>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'file'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope?: 'test' },
    fn: BuilderFixtureFn<V, Context & T>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'worker' },
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'worker'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'file' },
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'file'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope?: 'test' },
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<E extends object = object>(
    fixtures: ObjectFixtures<E, T, Context>
  ): TestDeclaration<FlattenFixtureContext<Omit<T, keyof E> & E>, Context>
  extend<E extends ScopedFixturesDefinition>(
    fixtures: ScopedFixtures<E, T, Context>
  ): TestDeclaration<T & ScopedFixtureValues<E>, Context>
  override<K extends keyof T>(
    name: K,
    fn: BuilderFixtureFn<T[K], Context & T>
  ): TestDeclaration<T, Context>
  override<K extends keyof T>(
    name: K,
    options: FixtureOptions,
    fn: BuilderFixtureFn<T[K], Context & T>
  ): TestDeclaration<T, Context>
  override<K extends keyof T>(
    name: K,
    value: T[K] extends (...args: any[]) => any ? never : T[K]
  ): TestDeclaration<T, Context>
  override<K extends keyof T>(
    name: K,
    options: FixtureOptions,
    value: T[K] extends (...args: any[]) => any ? never : T[K]
  ): TestDeclaration<T, Context>
  override(
    fixtures: Partial<ObjectFixtures<T, T, Context>>
  ): TestDeclaration<T, Context>
  /** @deprecated Use test.override() instead. */
  scoped(
    fixtures: Partial<ObjectFixtures<T, T, Context>>
  ): TestDeclaration<T, Context>
}

export interface SuiteDeclaration<Context extends object = TestContext> {
  <ExtraContext extends object = object>(
    name: Name,
    fn: (test: TestDeclaration<ExtraContext, Context>) => unknown,
    timeout?: number
  ): void
  <ExtraContext extends object = object>(
    name: Name,
    options: SuiteOptions,
    fn: (test: TestDeclaration<ExtraContext, Context>) => unknown
  ): void
  (name: Name): void
  readonly skip: SuiteDeclaration<Context>
  readonly only: SuiteDeclaration<Context>
  readonly todo: SuiteDeclaration<Context>
  readonly concurrent: SuiteDeclaration<Context>
  readonly shuffle: SuiteDeclaration<Context>
  each<C extends readonly unknown[]>(
    cases: readonly C[]
  ): EachDeclaration<C, SuiteOptions>
  each<C>(cases: readonly C[]): EachDeclaration<[C], SuiteOptions>
  each(
    strings: TemplateStringsArray,
    ...values: any[]
  ): EachDeclaration<any[], SuiteOptions>
  for<C>(cases: readonly C[]): EachDeclaration<[C], SuiteOptions>
  for(
    strings: TemplateStringsArray,
    ...values: any[]
  ): EachDeclaration<any[], SuiteOptions>
  skipIf(condition: unknown): SuiteDeclaration<Context>
  runIf(condition: unknown): SuiteDeclaration<Context>
}

export function validateOptions(
  options: TestOptions | SuiteOptions,
  suiteOptions = false
) {
  for (const key of Object.keys(options)) {
    if (key === 'tags') {
      if (options.tags === undefined) continue
      const tags = Array.isArray(options.tags) ? options.tags : [options.tags]
      if (tags.some((tag) => typeof tag !== 'string'))
        throw new TypeError('Test tags must be strings.')
      continue
    }
    if (key === 'meta') {
      if (
        options.meta !== undefined &&
        (!options.meta ||
          typeof options.meta !== 'object' ||
          Array.isArray(options.meta))
      )
        throw new TypeError('Test meta must be an object.')
      continue
    }
    if (key === 'shuffle' && suiteOptions) {
      if (typeof (options as SuiteOptions).shuffle !== 'boolean')
        throw new TypeError('Suite shuffle must be a boolean.')
      continue
    }
    if (key === 'concurrent') {
      if (typeof options.concurrent !== 'boolean')
        throw new TypeError('Test concurrent must be a boolean.')
      continue
    }
    if (key === 'fails' || key === 'skip' || key === 'only' || key === 'todo') {
      if (typeof options[key] !== 'boolean')
        throw new TypeError(`Test ${key} must be a boolean.`)
      continue
    }
    if (key === 'retry' && options.retry === undefined) continue
    if (key === 'retry' && typeof options.retry === 'object') {
      if (!options.retry || Array.isArray(options.retry))
        throw new TypeError('Test retry must be a number or an options object.')
      for (const field of Object.keys(options.retry)) {
        if (field === 'condition') {
          const condition = options.retry.condition
          if (
            condition !== undefined &&
            !(condition instanceof RegExp) &&
            typeof condition !== 'function'
          )
            throw new TypeError(
              'Test retry.condition must be a RegExp or a function.'
            )
          continue
        }
        if (field !== 'count' && field !== 'delay')
          unsupported(`test retry option "${field}"`)
        const value = options.retry[field]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !(field === 'count'
              ? Number.isSafeInteger(value)
              : Number.isFinite(value)) ||
            value < 0)
        ) {
          const kind =
            field === 'count'
              ? 'non-negative safe integer'
              : 'finite non-negative number'
          throw new TypeError(`Test retry.${field} must be a ${kind}.`)
        }
      }
      continue
    }
    if (key !== 'retry' && key !== 'timeout' && key !== 'repeats')
      unsupported(`test option "${key}"`)
    const value = options[key]
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new TypeError(`Test ${key} must be a non-negative safe integer.`)
    }
  }
}

function suite(
  id: string,
  name: string,
  mode: TestMode,
  parent?: TestSuite,
  options: SuiteOptions = {}
): TestSuite {
  return {
    type: 'suite',
    meta: options.meta ?? Object.create(null),
    tags: [
      ...new Set([
        ...(parent?.tags ?? []),
        ...(options.tags === undefined
          ? []
          : Array.isArray(options.tags)
            ? options.tags
            : [options.tags]),
      ]),
    ],
    id,
    name,
    mode,
    suite: parent,
    children: [],
    hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
    around: { aroundEach: [], aroundAll: [] },
    options,
    fixtureOverrides: new Map(),
  }
}

function formatName(name: Name): string {
  return typeof name === 'string'
    ? name
    : typeof name === 'function'
      ? name.name || '<anonymous>'
      : String(name)
}

function valueAt(value: unknown, path: string): unknown {
  let current: any = value
  for (const part of path.split('.')) current = current?.[part]
  return current
}

function formatTitle(
  template: string,
  items: readonly unknown[],
  index: number
) {
  template = template
    .replace(/%%/g, '__next_escaped_percent__')
    .replace(/%#/g, String(index))
    .replace(/%\$/g, String(index + 1))
    .replace(/__next_escaped_percent__/g, '%%')
  let item = 0
  template = template.replace(/%[sdifjoO]/g, (placeholder) => {
    if (item >= items.length) return placeholder
    const value = items[item++]
    return formatWithOptions({ depth: 10 }, placeholder, value)
  })
  const object = items[0]
  return template.replace(/\$([\w$.]+)/g, (placeholder, path: string) => {
    const value = /^\d+(?:\.|$)/.test(path)
      ? valueAt(items, path)
      : object !== null && typeof object === 'object'
        ? valueAt(object, path)
        : undefined
    return value === undefined
      ? placeholder
      : typeof value === 'string'
        ? value
        : inspect(value, { depth: 10 })
  })
}

function templateCases(strings: readonly string[], values: readonly unknown[]) {
  const headers = strings
    .join('')
    .trim()
    .replace(/ /g, '')
    .split('\n')[0]
    .split('|')
  const cases: Record<string, unknown>[] = []
  for (let row = 0; row < Math.floor(values.length / headers.length); row++) {
    const value: Record<string, unknown> = {}
    for (let column = 0; column < headers.length; column++)
      value[headers[column]] = values[row * headers.length + column]
    cases.push(value)
  }
  return cases
}

/** Runtime-only dispatch target for cached declarations in one compiler cohort. */
export interface CollectorDispatch {
  root: TestSuite
  createDeclaration(
    kind: 'test' | 'suite',
    mode: TestMode,
    fixtures?: FixtureDefinitions,
    options?: SuiteOptions
  ): any
  createHook(
    name: HookName,
    fixtures?: FixtureDefinitions
  ): (fn: TestBody, timeout?: number) => void
  createAround(
    name: AroundHookName,
    fixtures?: FixtureDefinitions
  ): (fn: AroundEachBody | AroundAllBody, timeout?: number) => void
}

/** One collector per evaluated file. No loader or Vitest runtime is started here. */
export function createCollector(
  fileId: string,
  config: {
    tags?: readonly TestTagDefinition[]
    strictTags?: boolean
    sequence?: TestSequenceOptions
    getRuntimeConfig?: () => import('../assertions/utilities').RuntimeOptions
    injectValue?: (name: string) => unknown
    getSuiteAlias?: () => SuiteDeclaration | undefined
    getActiveCollector?: () => CollectorDispatch | undefined
    isCollectingScope?: () => boolean
  } = {}
) {
  const root = suite(fileId, '', 'run', undefined, {
    ...(shuffleTests(config.sequence?.shuffle) === undefined
      ? {}
      : { shuffle: shuffleTests(config.sequence?.shuffle) }),
  })
  const suiteStorage = createDeclarationStorage<TestSuite>()
  const pending: Promise<PromiseSettledResult<unknown>>[] = []
  let closed = false

  const currentSuite = () => suiteStorage.getStore() ?? root

  function assertCollecting() {
    assertScopeActive()
    if (closed) throw new Error('Test collection has already closed.')
    if (config.isCollectingScope && !config.isCollectingScope())
      throw new Error(
        'Test declarations require their active file collection scope.'
      )
  }

  function declaration(
    kind: 'test' | 'suite',
    mode: TestMode,
    fixtures: FixtureDefinitions = {},
    declarationOptions: SuiteOptions = {}
  ): any {
    const redirected = () => {
      assertScopeActive()
      const active = config.getActiveCollector?.()
      return active && active.root !== root
        ? active.createDeclaration(kind, mode, fixtures, declarationOptions)
        : undefined
    }
    function fixturesFor(start: TestSuite) {
      return resolveFixtureDefinitions(fixtures, start)
    }
    const declare = (
      name: Name,
      optionsOrFn?: TestOptions | Function,
      body?: TestBody | number,
      ...extra: unknown[]
    ) => {
      const active = redirected()
      if (active)
        return Reflect.apply(active, undefined, [
          name,
          optionsOrFn,
          body,
          ...extra,
        ])
      assertCollecting()
      const current = currentSuite()
      if (extra.length) unsupported('additional declaration arguments')
      name = formatName(name)
      const id = `${current.id}/${current.children.length}`
      if (kind === 'suite') {
        let options: SuiteOptions = {}
        let fn: Function | undefined
        if (typeof optionsOrFn === 'function') {
          if (body !== undefined && typeof body !== 'number')
            unsupported('trailing suite options or multiple callbacks')
          options = typeof body === 'number' ? { timeout: body } : {}
          fn = optionsOrFn
        } else {
          if (body !== undefined && typeof body !== 'function')
            throw new TypeError('Suite callback must be a function.')
          options = (optionsOrFn as SuiteOptions | undefined) ?? {}
          fn = typeof body === 'function' ? body : undefined
        }
        validateOptions(options, true)
        options = { ...declarationOptions, ...options }
        // Chain modifiers override an explicit opposing option in 5.0.4.
        for (const key of ['concurrent', 'shuffle'] as const)
          if (declarationOptions[key] !== undefined)
            options[key] = declarationOptions[key]
        const inheritedOptions = {
          ...current.options,
          ...options,
          meta: Object.assign(
            Object.create(null),
            current === root ? undefined : current.meta,
            options.meta
          ),
        }
        if (config.strictTags) {
          for (const tag of options.tags === undefined
            ? []
            : Array.isArray(options.tags)
              ? options.tags
              : [options.tags])
            if (!config.tags?.some((definition) => definition.name === tag))
              throw new Error(`Unknown test tag "${tag}".`)
        }
        const optionMode = options.only
          ? 'only'
          : options.skip
            ? 'skip'
            : options.todo
              ? 'todo'
              : mode
        const child = suite(
          id,
          name,
          !fn && optionMode === 'run' ? 'todo' : optionMode,
          current,
          inheritedOptions
        )
        current.children.push(child)
        const result = fn
          ? suiteStorage.run(child, () => fn(declaration('test', 'run')))
          : undefined
        if (result && typeof result.then === 'function') {
          // Observe immediately, but report after every nested collection job
          // settles. The suite identity follows awaits without changing siblings.
          pending.push(
            Promise.resolve(result).then(
              (value) => ({ status: 'fulfilled' as const, value }),
              (reason) => ({ status: 'rejected' as const, reason })
            )
          )
        }
      } else {
        let options: TestOptions
        let fn: TestBody | undefined
        if (typeof optionsOrFn === 'function') {
          if (body !== undefined && typeof body !== 'number') {
            unsupported('trailing test options or multiple callbacks')
          }
          options = typeof body === 'number' ? { timeout: body } : {}
          fn = optionsOrFn as TestBody
        } else {
          if (
            optionsOrFn !== undefined &&
            (!optionsOrFn || typeof optionsOrFn !== 'object')
          ) {
            throw new TypeError('Test options must be an object.')
          }
          if (body !== undefined && typeof body !== 'function') {
            throw new TypeError('Test callback must be a function.')
          }
          options = optionsOrFn ?? {}
          fn = typeof body === 'function' ? body : undefined
        }
        const ownOptions = { ...declarationOptions, ...options }
        if (declarationOptions.concurrent !== undefined)
          ownOptions.concurrent = declarationOptions.concurrent
        const tags = [
          ...new Set([
            ...current.tags,
            ...(ownOptions.tags === undefined
              ? []
              : Array.isArray(ownOptions.tags)
                ? ownOptions.tags
                : [ownOptions.tags]),
          ]),
        ]
        const definitions = tags
          .flatMap((tag) => {
            const definition = config.tags?.find((entry) => entry.name === tag)
            if (!definition && config.strictTags)
              throw new Error(`Unknown test tag "${tag}".`)
            return definition ? [definition] : []
          })
          .sort((a, b) => (b.priority ?? Infinity) - (a.priority ?? Infinity))
        const tagOptions: TestOptions = {}
        const tagMeta = Object.create(null)
        for (const {
          name: _name,
          description: _description,
          priority: _priority,
          meta,
          ...definition
        } of definitions) {
          Object.assign(tagOptions, definition)
          Object.assign(tagMeta, meta)
        }
        const { shuffle: _shuffle, ...suiteOptions } = current.options
        options = {
          ...(config.sequence?.concurrent === undefined
            ? {}
            : { concurrent: config.sequence.concurrent }),
          ...(config.getRuntimeConfig?.().testTimeout === undefined
            ? {}
            : { timeout: config.getRuntimeConfig?.().testTimeout }),
          ...suiteOptions,
          ...tagOptions,
          ...ownOptions,
        }
        validateOptions(options)
        const meta = Object.assign(
          Object.create(null),
          tagMeta,
          current === root ? undefined : current.meta,
          ownOptions.meta
        )
        const optionMode = options.only
          ? 'only'
          : options.skip
            ? 'skip'
            : options.todo
              ? 'todo'
              : mode
        const test: TestCase = {
          type: 'test',
          meta,
          tags,
          id,
          name,
          mode: !fn && optionMode === 'run' ? 'todo' : optionMode,
          suite: current,
          options: { ...options },
          fixtures,
          fn,
        }
        Object.defineProperty(test, 'registrationError', { value: new Error() })
        current.children.push(test)
      }
    }
    const builder: FixtureBuilderOperations = {
      extend(...args) {
        const active = redirected()
        if (active) return active.extend(...args)
        const [fixturesOrName, optionsOrValue, value] = args
        assertCollecting()
        const current = currentSuite()
        const extra = normalizeFixtureArguments(
          'test.extend',
          fixturesOrName,
          optionsOrValue,
          value,
          args.length >= 3
        )
        const extended = extendFixtures(
          resolveFixtureDefinitions(fixtures, root),
          extra,
          false,
          config.injectValue
        )
        validateFixtureDefinitions(
          extended,
          Object.keys(extra),
          current === root
        )
        return declaration('test', 'run', extended)
      },
      override(...args) {
        const active = redirected()
        if (active) return active.override(...args)
        const [fixturesOrName, optionsOrValue, value] = args
        assertCollecting()
        const current = currentSuite()
        const extra = normalizeFixtureArguments(
          'test.override',
          fixturesOrName,
          optionsOrValue,
          value,
          args.length >= 3
        )
        const inherited = fixturesFor(current)
        for (const name of Object.keys(extra)) {
          if (!(name in inherited))
            throw new Error(`Cannot override unknown fixture "${name}".`)
        }
        const overridden = extendFixtures(
          inherited,
          extra,
          true,
          config.injectValue
        )
        validateFixtureDefinitions(
          overridden,
          Object.keys(extra),
          current === root
        )
        current.fixtureOverrides.set(fixtures, overridden)
      },
    }
    const receiverContext = { getFixtures: () => builder }
    return new Proxy(declare, {
      get(target, key, receiver) {
        if (kind === 'test' && (key === 'beforeAll' || key === 'afterAll'))
          return hook(key, fixtures)
        if (kind === 'test' && (key === 'beforeEach' || key === 'afterEach'))
          return hook(key)
        if (kind === 'test' && (key === 'aroundEach' || key === 'aroundAll'))
          return around(key, fixtures)
        assertScopeActive()
        if (kind === 'test' && (key === 'describe' || key === 'suite'))
          return config.getSuiteAlias?.() ?? describe
        if (key === 'scoped' && kind === 'test')
          return function (this: TestDeclaration, values: object) {
            console.warn(
              'test.scoped() is deprecated and will be removed in future versions. Please use test.override() instead.'
            )
            this.override(values)
            return this
          }
        if (key === fixtureBuilderReceiver && kind === 'test')
          return receiverContext
        if (key === 'extend' && kind === 'test')
          return function (
            this: TestDeclaration,
            ...args: FixtureBuilderArguments
          ) {
            assertScopeActive()
            return fixtureBuilderOperations(this).extend(...args)
          }
        if (key === 'override' && kind === 'test')
          return function (
            this: TestDeclaration,
            ...args: FixtureBuilderArguments
          ) {
            assertScopeActive()
            fixtureBuilderOperations(this).override(...args)
            return this
          }
        if (
          (key === 'each' || key === 'for') &&
          (kind === 'test' || kind === 'suite')
        )
          return (casesOrStrings: readonly unknown[], ...values: unknown[]) => {
            assertScopeActive()
            const cases =
              Array.isArray(casesOrStrings) && values.length
                ? templateCases(casesOrStrings as readonly string[], values)
                : casesOrStrings
            if (!Array.isArray(cases))
              throw new TypeError(
                `${kind}.${String(key)} requires an array or template table.`
              )
            return (
              name: Name,
              optionsOrFn?: TestOptions | Function,
              bodyOrTimeout?: Function | number
            ) => {
              const options =
                optionsOrFn && typeof optionsOrFn === 'object'
                  ? optionsOrFn
                  : undefined
              const fn =
                typeof optionsOrFn === 'function'
                  ? optionsOrFn
                  : typeof bodyOrTimeout === 'function'
                    ? bodyOrTimeout
                    : undefined
              const timeout =
                typeof bodyOrTimeout === 'number' ? bodyOrTimeout : undefined
              const arrayOnly = cases.every(Array.isArray)
              cases.forEach((value, index) => {
                const items = Array.isArray(value) ? value : [value]
                const title = formatTitle(formatName(name), items, index)
                let callback: Function | undefined
                if (fn) {
                  if (key === 'for' && kind === 'test') {
                    callback = (context: TestContext) => fn(value, context)
                    configureFixtureCallback(callback, fn, 1)
                  } else if (arrayOnly) callback = () => fn(...items)
                  else callback = () => fn(value)
                }
                if (options) declare(title, options, callback as TestBody)
                else declare(title, callback as TestBody | undefined, timeout)
              })
            }
          }
        if (key === 'skip' || key === 'only' || key === 'todo')
          return declaration(
            kind,
            mode === 'skip' || mode === 'todo' ? mode : key,
            fixtures,
            declarationOptions
          )
        if (key === 'shuffle' && kind === 'suite')
          return declaration(kind, mode, fixtures, {
            ...declarationOptions,
            shuffle: true,
          })
        if (key === 'concurrent')
          return declaration(kind, mode, fixtures, {
            ...declarationOptions,
            concurrent: true,
          })
        if (key === 'fails' && kind === 'test')
          return declaration(kind, mode, fixtures, {
            ...declarationOptions,
            fails: true,
          })
        if (key === 'skipIf')
          return (condition: unknown) => {
            assertScopeActive()
            return declaration(
              kind,
              condition ? 'skip' : mode,
              fixtures,
              declarationOptions
            )
          }
        if (key === 'runIf')
          return (condition: unknown) => {
            assertScopeActive()
            return declaration(
              kind,
              condition ? mode : 'skip',
              fixtures,
              declarationOptions
            )
          }
        if (Reflect.has(target, key) || typeof key === 'symbol')
          return Reflect.get(target, key, receiver)
        return unsupported(`${kind === 'test' ? 'test' : 'describe'}.${key}`)
      },
    })
  }

  const test: TestDeclaration<{}, InternalTestContext> = declaration(
    'test',
    'run'
  )
  const describe: SuiteDeclaration<InternalTestContext> = declaration(
    'suite',
    'run'
  )
  const hook =
    (name: HookName, fixtures?: FixtureDefinitions) =>
    (fn: TestBody, timeout?: number) => {
      assertScopeActive()
      const active = config.getActiveCollector?.()
      if (active && active.root !== root)
        return active.createHook(name, fixtures)(fn, timeout)
      assertCollecting()
      if (typeof fn !== 'function')
        throw new TypeError(`${name} requires a callback.`)
      if (timeout !== undefined) validateOptions({ timeout })
      const registered: Hook = {
        fn,
        fixtures,
        timeout: timeout ?? config.getRuntimeConfig?.().hookTimeout,
      }
      Object.defineProperty(registered, 'registrationError', {
        value: new Error(),
      })
      currentSuite().hooks[name].push(registered)
    }
  const around =
    (name: AroundHookName, fixtures: FixtureDefinitions = {}) =>
    (fn: AroundHook['fn'], timeout?: number) => {
      assertScopeActive()
      const active = config.getActiveCollector?.()
      if (active && active.root !== root)
        return active.createAround(name, fixtures)(fn, timeout)
      assertCollecting()
      if (typeof fn !== 'function')
        throw new TypeError(`${name} requires a callback.`)
      if (timeout !== undefined) validateOptions({ timeout })
      const registered: AroundHook = {
        fn,
        fixtures,
        timeout: timeout ?? config.getRuntimeConfig?.().hookTimeout,
      }
      Object.defineProperty(registered, 'registrationErrors', {
        value: { setup: new Error(), teardown: new Error() },
      })
      currentSuite().around[name].push(registered)
    }

  return {
    root,
    createDeclaration: declaration,
    createHook: hook,
    createAround: around,
    api: {
      test,
      it: test,
      describe,
      suite: describe,
      beforeAll: hook('beforeAll'),
      afterAll: hook('afterAll'),
      beforeEach: hook('beforeEach'),
      afterEach: hook('afterEach'),
      aroundEach: around('aroundEach'),
      aroundAll: around('aroundAll'),
    },
    async settle() {
      const errors: unknown[] = []
      // Awaiting a suite can register more async suites. Read the live queue
      // length until all collection work, including rejected siblings, finishes.
      for (let index = 0; index < pending.length; index++) {
        const result = await pending[index]
        if (result.status === 'rejected') errors.push(result.reason)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1)
        throw new AggregateError(errors, 'Test suite collection failed.')
    },
    close() {
      closed = true
      return root
    },
  }
}

export function hasFocusedTests(node: TestSuite | TestCase): boolean {
  return (
    node.mode === 'only' ||
    (node.type === 'suite' && node.children.some(hasFocusedTests))
  )
}

export function selectedCases(
  root: TestSuite
): Map<TestCase, 'run' | 'skip' | 'todo'> {
  const cases = new Map<TestCase, 'run' | 'skip' | 'todo'>()
  const containsOnly = new Map<TestSuite, boolean>()
  function collectFocus(node: TestSuite | TestCase): boolean {
    let childrenOnly = false
    if (node.type === 'suite') {
      for (const child of node.children)
        if (collectFocus(child)) childrenOnly = true
      containsOnly.set(node, childrenOnly)
    }
    // Collection records focus even beneath skipped and todo suites.
    return node.mode === 'only' || childrenOnly
  }
  const focused = collectFocus(root)
  function visit(
    node: TestSuite,
    inherited: 'run' | 'skip' | 'todo',
    parentIsOnly: boolean
  ) {
    const suiteIsOnly = parentIsOnly || node.mode === 'only'
    const childrenOnly = focused && containsOnly.get(node)
    for (const child of node.children) {
      // Descendant focus narrows an enclosing describe.only to those branches.
      const included = childrenOnly
        ? child.mode === 'only' ||
          (child.type === 'suite' && containsOnly.get(child))
        : suiteIsOnly || child.mode === 'only'
      const mode =
        inherited !== 'run'
          ? inherited
          : child.mode === 'todo'
            ? 'todo'
            : child.mode === 'skip' || (focused && !included)
              ? 'skip'
              : 'run'
      if (child.type === 'suite') visit(child, mode, !!included)
      else cases.set(child, mode)
    }
  }
  visit(
    root,
    root.mode === 'skip' || root.mode === 'todo' ? root.mode : 'run',
    false
  )
  return cases
}

/** Declaration-order facts, after real setup/spec and asynchronous collection. */
export function collectTestCases(
  root: TestSuite,
  options: { testNamePattern?: string | RegExp; allowOnly?: boolean } = {}
): { id: string; name: string }[] {
  if (options.allowOnly === false && hasFocusedTests(root))
    throw new Error(
      'Collected listing with focus and allowOnly:false is not implemented.'
    )
  const pattern =
    options.testNamePattern === undefined
      ? undefined
      : new RegExp(options.testNamePattern)
  const cases: { id: string; name: string }[] = []
  for (const [test, mode] of selectedCases(root)) {
    if (mode !== 'run') continue
    const names = [test.name]
    for (let parent = test.suite; parent !== root; parent = parent.suite!)
      names.unshift(parent.name)
    const name = names.join(' > ')
    if (pattern && !name.match(pattern)) continue
    cases.push({ id: test.id, name })
  }
  return cases
}
