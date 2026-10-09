import {
  configureFixtureCallback,
  extendFixtures,
  validateFixtureDefinitions,
} from './fixtures'
import type { FixtureDefinition, FixtureDefinitions } from './fixtures'
import { assertScopeActive } from './async-context'
import { formatWithOptions, inspect } from 'node:util'

export type TestMode = 'run' | 'skip' | 'todo' | 'only'
export type HookName = 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach'
export type Cleanup = () => void | Promise<void>

export interface TestContext {
  readonly signal: AbortSignal
  onTestFinished(handler: TestBody, timeout?: number): void
  onTestFailed(handler: TestBody, timeout?: number): void
}

export type TestBody = (context: TestContext) => unknown | Promise<unknown>
export type Hook = {
  fn: TestBody
  timeout?: number
}

export interface TestOptions {
  retry?: number
  timeout?: number
  repeats?: number
  fails?: boolean
  concurrent?: false
  skip?: boolean
  only?: boolean
  todo?: boolean
}

export interface TestCase {
  type: 'test'
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
  id: string
  name: string
  mode: TestMode
  suite?: TestSuite
  children: (TestCase | TestSuite)[]
  hooks: Record<HookName, Hook[]>
  options: TestOptions
  fixtureOverrides: Map<FixtureDefinitions, FixtureDefinitions>
}

type Name = string | Function
type EachCallback<T extends readonly unknown[]> = (...items: T) => unknown
type EachDeclaration<T extends readonly unknown[]> = {
  (name: Name, fn: EachCallback<T>, timeout?: number): void
  (name: Name, options: TestOptions, fn: EachCallback<T>): void
}
type ForDeclaration<T, C extends object> = {
  (name: Name, fn: (item: T, context: TestContext & C) => unknown): void
  (
    name: Name,
    options: TestOptions,
    fn: (item: T, context: TestContext & C) => unknown
  ): void
}

export function unsupported(api: string): never {
  throw new Error(`Next testing does not support ${api} yet.`)
}

export interface TestDeclaration<T extends object = {}> {
  (
    name: Name,
    fn: (context: TestContext & T) => unknown,
    timeout?: number
  ): void
  (
    name: Name,
    options: TestOptions,
    fn: (context: TestContext & T) => unknown
  ): void
  (name: Name): void
  readonly skip: TestDeclaration<T>
  readonly only: TestDeclaration<T>
  readonly todo: TestDeclaration<T>
  readonly fails: TestDeclaration<T>
  each<C extends readonly unknown[]>(cases: readonly C[]): EachDeclaration<C>
  each<C>(cases: readonly C[]): EachDeclaration<[C]>
  for<C>(cases: readonly C[]): ForDeclaration<C, T>
  skipIf(condition: unknown): TestDeclaration<T>
  runIf(condition: unknown): TestDeclaration<T>
  extend<E extends object>(fixtures: {
    [K in keyof E]:
      | E[K]
      | ((
          context: TestContext & T & E,
          use: (value: E[K]) => Promise<void>
        ) => Promise<void>)
      | [
          (
            | E[K]
            | ((
                context: TestContext & T & E,
                use: (value: E[K]) => Promise<void>
              ) => Promise<void>)
          ),
          { scope?: 'test' | 'file'; auto?: boolean },
        ]
  }): TestDeclaration<T & E>
  override(
    fixtures: Partial<{
      [K in keyof T]:
        | T[K]
        | ((
            context: TestContext & T,
            use: (value: T[K]) => Promise<void>
          ) => Promise<void>)
        | [
            (
              | T[K]
              | ((
                  context: TestContext & T,
                  use: (value: T[K]) => Promise<void>
                ) => Promise<void>)
            ),
            { scope?: 'test' | 'file'; auto?: boolean },
          ]
    }>
  ): TestDeclaration<T>
}

export interface SuiteDeclaration {
  (name: Name, fn: () => void, timeout?: number): void
  (name: Name, options: TestOptions, fn: () => void): void
  (name: Name): void
  readonly skip: SuiteDeclaration
  readonly only: SuiteDeclaration
  readonly todo: SuiteDeclaration
  each<C extends readonly unknown[]>(cases: readonly C[]): EachDeclaration<C>
  each<C>(cases: readonly C[]): EachDeclaration<[C]>
  for<C>(cases: readonly C[]): EachDeclaration<[C]>
  skipIf(condition: unknown): SuiteDeclaration
  runIf(condition: unknown): SuiteDeclaration
}

function validateOptions(options: TestOptions) {
  for (const key of Object.keys(options)) {
    if (key === 'concurrent') {
      if (options.concurrent !== false)
        unsupported('concurrent tests and suites')
      continue
    }
    if (key === 'fails' || key === 'skip' || key === 'only' || key === 'todo') {
      if (typeof options[key] !== 'boolean')
        throw new TypeError(`Test ${key} must be a boolean.`)
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
  options: TestOptions = {}
): TestSuite {
  return {
    type: 'suite',
    id,
    name,
    mode,
    suite: parent,
    children: [],
    hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
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

/** One collector per evaluated file. No loader or Vitest runtime is started here. */
export function createCollector(fileId: string) {
  const root = suite(fileId, '', 'run')
  let current = root
  let closed = false

  function assertCollecting() {
    assertScopeActive()
    if (closed) throw new Error('Test collection has already closed.')
  }

  function declaration(
    kind: 'test' | 'suite',
    mode: TestMode,
    fixtures: FixtureDefinitions = {},
    declarationOptions: TestOptions = {}
  ): any {
    function fixturesFor(start: TestSuite) {
      for (let node: TestSuite | undefined = start; node; node = node.suite) {
        const override = node.fixtureOverrides.get(fixtures)
        if (override) return override
      }
      return fixtures
    }
    const declare = (
      name: Name,
      optionsOrFn?: TestOptions | Function,
      body?: TestBody | number,
      ...extra: unknown[]
    ) => {
      assertCollecting()
      if (extra.length) unsupported('additional declaration arguments')
      name = formatName(name)
      const id = `${current.id}/${current.children.length}`
      if (kind === 'suite') {
        let options: TestOptions = {}
        let fn: Function | undefined
        if (typeof optionsOrFn === 'function') {
          if (body !== undefined && typeof body !== 'number')
            unsupported('trailing suite options or multiple callbacks')
          options = typeof body === 'number' ? { timeout: body } : {}
          fn = optionsOrFn
        } else {
          if (body !== undefined && typeof body !== 'function')
            throw new TypeError('Suite callback must be a function.')
          options = (optionsOrFn as TestOptions | undefined) ?? {}
          fn = typeof body === 'function' ? body : undefined
        }
        validateOptions(options)
        options = { ...declarationOptions, ...options }
        const inheritedOptions = { ...current.options, ...options }
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
        const parent = current
        current = child
        try {
          const result = fn ? fn() : undefined
          if (result && typeof result.then === 'function') {
            // Observe rejection even though asynchronous declaration is unsupported.
            Promise.resolve(result).catch(() => {})
            unsupported('asynchronous describe callbacks')
          }
        } finally {
          current = parent
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
        options = { ...current.options, ...declarationOptions, ...options }
        validateOptions(options)
        const optionMode = options.only
          ? 'only'
          : options.skip
            ? 'skip'
            : options.todo
              ? 'todo'
              : mode
        current.children.push({
          type: 'test',
          id,
          name,
          mode: !fn && optionMode === 'run' ? 'todo' : optionMode,
          suite: current,
          options: { ...options },
          fixtures: fixturesFor(current),
          fn,
        })
      }
    }
    return new Proxy(declare, {
      get(target, key, receiver) {
        assertScopeActive()
        if (key === 'extend' && kind === 'test')
          return (extra: Record<string, FixtureDefinition>) => {
            assertScopeActive()
            if (!extra || typeof extra !== 'object' || Array.isArray(extra))
              throw new TypeError('test.extend requires a fixture object.')
            const extended = extendFixtures(fixtures, extra)
            validateFixtureDefinitions(
              extended,
              Object.keys(extra),
              current === root
            )
            return declaration(kind, mode, extended, declarationOptions)
          }
        if (key === 'override' && kind === 'test')
          return (extra: Record<string, FixtureDefinition>) => {
            assertCollecting()
            if (!extra || typeof extra !== 'object' || Array.isArray(extra))
              throw new TypeError('test.override requires a fixture object.')
            const inherited = fixturesFor(current)
            for (const name of Object.keys(extra)) {
              if (!(name in inherited))
                throw new Error(`Cannot override unknown fixture "${name}".`)
            }
            const overridden = extendFixtures(inherited, extra)
            validateFixtureDefinitions(
              overridden,
              Object.keys(extra),
              current === root
            )
            current.fixtureOverrides.set(fixtures, overridden)
            return receiver
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

  const test: TestDeclaration = declaration('test', 'run')
  const describe: SuiteDeclaration = declaration('suite', 'run')
  const hook = (name: HookName) => (fn: TestBody, timeout?: number) => {
    assertCollecting()
    if (typeof fn !== 'function')
      throw new TypeError(`${name} requires a callback.`)
    if (timeout !== undefined) validateOptions({ timeout })
    current.hooks[name].push({ fn, timeout })
  }

  return {
    root,
    api: {
      test,
      it: test,
      describe,
      suite: describe,
      beforeAll: hook('beforeAll'),
      afterAll: hook('afterAll'),
      beforeEach: hook('beforeEach'),
      afterEach: hook('afterEach'),
    },
    close() {
      closed = true
      return root
    },
  }
}

export function selectedCases(
  root: TestSuite
): Map<TestCase, 'run' | 'skip' | 'todo'> {
  const cases = new Map<TestCase, 'run' | 'skip' | 'todo'>()
  function hasOnly(node: TestSuite | TestCase): boolean {
    if (node.mode === 'skip' || node.mode === 'todo') return false
    return (
      node.mode === 'only' ||
      (node.type === 'suite' && node.children.some(hasOnly))
    )
  }
  const focused = hasOnly(root)
  function visit(
    node: TestSuite | TestCase,
    inherited: TestMode,
    only: boolean
  ) {
    const mode =
      inherited === 'skip' || inherited === 'todo' ? inherited : node.mode
    only ||= mode === 'only'
    if (node.type === 'suite') {
      node.children.forEach((child) => visit(child, mode, only))
    } else {
      cases.set(
        node,
        mode === 'todo'
          ? 'todo'
          : mode === 'skip' || (focused && !only)
            ? 'skip'
            : 'run'
      )
    }
  }
  visit(root, 'run', false)
  return cases
}
