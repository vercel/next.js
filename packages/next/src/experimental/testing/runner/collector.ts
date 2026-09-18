import type { FixtureDefinitions } from './fixtures'
import { assertScopeActive } from './async-context'

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
}

export function unsupported(api: string): never {
  throw new Error(`Next testing does not support ${api} yet.`)
}

export interface TestDeclaration<T extends object = {}> {
  (
    name: string,
    fn: (context: TestContext & T) => unknown,
    timeout?: number
  ): void
  (
    name: string,
    options: TestOptions,
    fn: (context: TestContext & T) => unknown
  ): void
  readonly skip: TestDeclaration<T>
  readonly only: TestDeclaration<T>
  readonly todo: (name: string) => void
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
}

export interface SuiteDeclaration {
  (name: string, fn: () => void): void
  readonly skip: SuiteDeclaration
  readonly only: SuiteDeclaration
  readonly todo: (name: string) => void
  skipIf(condition: unknown): SuiteDeclaration
  runIf(condition: unknown): SuiteDeclaration
}

function validateOptions(options: TestOptions) {
  for (const key of Object.keys(options)) {
    if (key !== 'retry' && key !== 'timeout')
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
  parent?: TestSuite
): TestSuite {
  return {
    type: 'suite',
    id,
    name,
    mode,
    suite: parent,
    children: [],
    hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
  }
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
    fixtures: FixtureDefinitions = {}
  ): any {
    const declare = (
      name: string,
      optionsOrFn?: TestOptions | Function,
      body?: TestBody | number,
      ...extra: unknown[]
    ) => {
      assertCollecting()
      if (extra.length) unsupported('additional declaration arguments')
      if (typeof name !== 'string')
        throw new TypeError('Test name must be a string.')
      const id = `${current.id}/${current.children.length}`
      if (kind === 'suite') {
        if (
          body !== undefined ||
          (optionsOrFn !== undefined && typeof optionsOrFn !== 'function')
        ) {
          unsupported('describe options')
        }
        const child = suite(id, name, mode, current)
        if (mode !== 'todo' && typeof optionsOrFn !== 'function') {
          throw new TypeError('describe requires a callback.')
        }
        current.children.push(child)
        const parent = current
        current = child
        try {
          const result =
            typeof optionsOrFn === 'function' ? optionsOrFn() : undefined
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
        validateOptions(options)
        if (mode !== 'todo' && typeof fn !== 'function') {
          throw new TypeError(
            'test requires a callback; use test.todo for pending tests.'
          )
        }
        current.children.push({
          type: 'test',
          id,
          name,
          mode,
          suite: current,
          options: { ...options },
          fixtures,
          fn,
        })
      }
    }
    return new Proxy(declare, {
      get(target, key, receiver) {
        assertScopeActive()
        if (key === 'extend' && kind === 'test')
          return (extra: FixtureDefinitions) => {
            assertScopeActive()
            for (const name of Object.keys(extra))
              if (name in fixtures) unsupported('fixture overrides')
            return declaration(kind, mode, { ...fixtures, ...extra })
          }
        if (key === 'skip' || key === 'only' || key === 'todo')
          return declaration(
            kind,
            mode === 'skip' || mode === 'todo' ? mode : key,
            fixtures
          )
        if (key === 'skipIf')
          return (condition: unknown) => {
            assertScopeActive()
            return declaration(kind, condition ? 'skip' : mode, fixtures)
          }
        if (key === 'runIf')
          return (condition: unknown) => {
            assertScopeActive()
            return declaration(kind, condition ? mode : 'skip', fixtures)
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
