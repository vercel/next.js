import { unsupported, type Cleanup, type TestSuite } from './collector'

type FixtureFactory = (
  context: Record<string, unknown>,
  use: (value: unknown) => Promise<void>
) => Promise<void>
export interface FixtureOptions {
  scope?: 'test' | 'file' | 'worker'
  auto?: boolean
  injected?: boolean
}
export type BuilderFixtureFn<T, Context> = (
  context: Context,
  fixture: { onCleanup(cleanup: Cleanup): void }
) => T | Promise<T>

export type FixtureDefinition = unknown | [unknown, FixtureOptions]
export interface FixtureRegistration {
  name: string
  definition: FixtureDefinition
  parent?: FixtureRegistration
}
export type FixtureDefinitions = Record<string, FixtureRegistration>
const fixtureDefinitionOrder = new WeakMap<FixtureDefinitions, number>()
const fixtureDefinitionOwners = new WeakMap<
  FixtureDefinitions,
  FixtureDefinitions
>()
let nextFixtureDefinitionOrder = 0
type Fixture = {
  value: unknown
  scope: 'test' | 'file' | 'worker'
  auto: boolean
  registration: FixtureRegistration
}

const fixtureCallbackMetadata = new WeakMap<
  Function,
  { original: Function; argument: number }
>()

export function configureFixtureCallback(
  fn: Function,
  original: Function,
  argument: number
) {
  fixtureCallbackMetadata.set(fn, { original, argument })
}

export function resolveFixtureDefinitions(
  definitions: FixtureDefinitions,
  suite: TestSuite
): FixtureDefinitions {
  for (
    let current: TestSuite | undefined = suite;
    current;
    current = current.suite
  ) {
    const overridden = current.fixtureOverrides.get(definitions)
    if (overridden) return overridden
  }
  return definitions
}

function hasBuilderFixtureOptions(value: object): boolean {
  return Object.keys(value).some(
    (key) => key === 'auto' || key === 'scope' || key === 'injected'
  )
}

export function normalizeFixtureArguments(
  api: 'test.extend' | 'test.override',
  fixturesOrName: unknown,
  optionsOrValue?: unknown,
  maybeValue?: unknown,
  hasOptions = maybeValue !== undefined
): Record<string, FixtureDefinition> {
  if (typeof fixturesOrName !== 'string') {
    if (
      !fixturesOrName ||
      typeof fixturesOrName !== 'object' ||
      Array.isArray(fixturesOrName)
    )
      throw new TypeError(`${api} requires a fixture object.`)
    return fixturesOrName as Record<string, FixtureDefinition>
  }
  let options: FixtureOptions | undefined
  let value: unknown
  if (hasOptions && maybeValue !== undefined) {
    options = optionsOrValue as FixtureOptions
    value = maybeValue
  } else if (
    optionsOrValue !== null &&
    typeof optionsOrValue === 'object' &&
    !Array.isArray(optionsOrValue) &&
    hasBuilderFixtureOptions(optionsOrValue)
  ) {
    const candidate = optionsOrValue as FixtureOptions
    // The target's builder and tuple parsers independently select options.
    // Capture actual fields once, in that parser's order, before later use.
    if (hasBuilderFixtureOptions(candidate)) {
      const auto = candidate.auto ?? false
      const scope = candidate.scope ?? 'test'
      const injected = candidate.injected ?? false
      options = { auto, scope, injected }
      value = {}
    } else value = [{}, candidate]
  } else value = optionsOrValue
  if (typeof value === 'function') {
    const builder = value as BuilderFixtureFn<unknown, Record<string, unknown>>
    const factory: FixtureFactory = async (context, provide) => {
      let cleanup: Cleanup | undefined
      const onCleanup = (fn: Cleanup) => {
        if (cleanup !== undefined)
          throw new Error(
            'onCleanup can only be called once per fixture. Define separate fixtures if you need multiple cleanup functions.'
          )
        cleanup = fn
      }
      await provide(await builder(context, { onCleanup }))
      if (cleanup) await cleanup()
    }
    configureFixtureCallback(factory, builder, 0)
    value = factory
  }
  return { [fixturesOrName]: options ? [value, options] : value }
}

export function extendFixtures(
  base: FixtureDefinitions,
  extra: Record<string, FixtureDefinition>,
  inheritOwner = false,
  injectValue?: (name: string) => unknown
): FixtureDefinitions {
  const definitions: FixtureDefinitions = Object.assign(
    Object.create(null),
    base
  )
  if (inheritOwner)
    fixtureDefinitionOwners.set(
      definitions,
      fixtureDefinitionOwners.get(base) ?? base
    )
  else fixtureDefinitionOrder.set(definitions, nextFixtureDefinitionOrder++)
  for (const [name, definition] of Object.entries(extra)) {
    let resolved = definition
    if (
      Array.isArray(definition) &&
      definition.length === 2 &&
      definition[1] &&
      typeof definition[1] === 'object' &&
      definition[1].injected
    )
      resolved = [injectValue?.(name) ?? definition[0], definition[1]]
    definitions[name] = {
      name,
      definition: resolved,
      parent: definitions[name],
    }
  }
  return definitions
}

export function validateFixtureDefinitions(
  definitions: FixtureDefinitions,
  names: readonly string[],
  supportNonTest: boolean
) {
  for (const name of names) {
    const fixture = normalize(definitions[name])
    if (!supportNonTest && fixture.scope !== 'test') {
      throw new Error(
        `The "${name}" fixture cannot be defined with a ${fixture.scope} scope inside the describe block. Define it at the top level of the file instead.`
      )
    }
  }
}

/** The first increment deliberately accepts only plain object destructuring. */
function dependencies(fn: Function): string[] {
  const metadata = fixtureCallbackMetadata.get(fn)
  const implementation = metadata?.original ?? fn
  const argument = metadata?.argument ?? 0
  const source = Function.prototype.toString
    .call(implementation)
    .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const match = source.match(/^[^(]*\(([^)]*)\)/)
  if (!match) {
    return unsupported('fixture callbacks without plain object destructuring')
  }
  const args = splitByComma(match[1])
  const fixtureArgument = args[argument]
  if (!fixtureArgument) return []
  if (!(fixtureArgument.startsWith('{') && fixtureArgument.endsWith('}')))
    return unsupported('fixture callbacks without object destructuring')
  const properties = splitByComma(fixtureArgument.slice(1, -1))
  if (!properties.length) return []
  return properties
    .map((property) => property.trim())
    .filter(Boolean)
    .map((property) => {
      if (property.startsWith('...'))
        unsupported('fixture destructuring rest properties')
      const name = property.replace(/:.*|=.*/g, '').trim()
      if (!/^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(name))
        unsupported('nested or computed fixture destructuring')
      return name
    })
}

function splitByComma(source: string): string[] {
  const result: string[] = []
  const stack: string[] = []
  let start = 0
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    if (character === '{' || character === '[' || character === '(')
      stack.push(character === '{' ? '}' : character === '[' ? ']' : ')')
    else if (character === stack.at(-1)) stack.pop()
    else if (character === ',' && stack.length === 0) {
      const value = source.slice(start, index).trim()
      if (value) result.push(value)
      start = index + 1
    }
  }
  const value = source.slice(start).trim()
  if (value) result.push(value)
  return result
}

function normalize(registration: FixtureRegistration): Fixture {
  const definition = registration.definition
  const parent = registration.parent
    ? normalize(registration.parent)
    : undefined
  if (
    Array.isArray(definition) &&
    definition.length === 2 &&
    definition[1] &&
    typeof definition[1] === 'object' &&
    ('scope' in definition[1] ||
      'auto' in definition[1] ||
      'injected' in definition[1])
  ) {
    const [value, options] = definition
    for (const key of Object.keys(options))
      if (key !== 'scope' && key !== 'auto' && key !== 'injected')
        unsupported(`fixture option "${key}"`)
    if (
      options.scope !== undefined &&
      options.scope !== 'test' &&
      options.scope !== 'file' &&
      options.scope !== 'worker'
    )
      unsupported(`fixture scope "${options.scope}"`)
    if (parent && (options.scope ?? 'test') !== parent.scope)
      throw new Error(
        `The "${registration.name}" fixture was already registered with a "${parent.scope}" scope.`
      )
    if (parent && (options.auto ?? false) !== parent.auto)
      throw new Error(
        `The "${registration.name}" fixture was already registered as { auto: ${parent.auto} }.`
      )
    return {
      value,
      scope: options.scope ?? 'test',
      auto: options.auto ?? false,
      registration,
    }
  }
  return {
    value: definition,
    scope: parent?.scope ?? 'test',
    auto: parent?.auto ?? false,
    registration,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** One execution-worker owner, separate from every file and attempt cache. */
export function createFixtureWorker(
  runWorkerFixture: <T>(fn: () => T) => T = (fn) => fn()
) {
  const cache = new Map<
    FixtureDefinitions,
    Map<FixtureRegistration, Promise<unknown>>
  >()
  const cleanups = new Map<FixtureDefinitions, Cleanup[]>()
  let state: 'active' | 'closing' | 'closed' = 'active'
  let disposal: Promise<void> | undefined
  return {
    cache,
    cleanups,
    run<T>(fn: () => T): T {
      if (state !== 'active')
        throw new Error('Worker fixture owner has already closed.')
      return runWorkerFixture(fn)
    },
    dispose(): Promise<void> {
      if (disposal) return disposal
      state = 'closing'
      disposal = (async () => {
        let errors: unknown[] = []
        try {
          errors = (
            await runWorkerFixture(() =>
              Promise.all(
                [...cleanups]
                  .sort(
                    ([left], [right]) =>
                      (fixtureDefinitionOrder.get(left) ?? 0) -
                      (fixtureDefinitionOrder.get(right) ?? 0)
                  )
                  .map(async ([, callbacks]) => {
                    const failures: unknown[] = []
                    while (callbacks.length) {
                      try {
                        await callbacks.pop()!()
                      } catch (error) {
                        failures.push(error)
                      }
                    }
                    return failures
                  })
              )
            )
          ).flat()
        } finally {
          cache.clear()
          cleanups.clear()
          state = 'closed'
        }
        if (errors.length === 1) throw errors[0]
        if (errors.length)
          throw new AggregateError(errors, 'Worker fixture disposal failed')
      })()
      return disposal
    },
  }
}

export type FixtureWorker = ReturnType<typeof createFixtureWorker>

export function createFixtureFile(
  runFileFixture: <T>(fn: () => T) => T,
  worker: FixtureWorker
) {
  const fileCache = new Map<
    FixtureDefinitions,
    Map<FixtureRegistration, Promise<unknown>>
  >()
  const fileCleanups: Cleanup[] = []
  return {
    cleanups: fileCleanups,
    attempt(
      definitions: FixtureDefinitions,
      context: Record<string, unknown>,
      suiteHook?: string,
      reuseContext = false
    ) {
      const testCache = new Map<FixtureRegistration, Promise<unknown>>()
      const cleanups: Cleanup[] = []
      const owner = fixtureDefinitionOwners.get(definitions) ?? definitions
      let workerCleanups = worker.cleanups.get(owner)
      if (!workerCleanups) worker.cleanups.set(owner, (workerCleanups = []))
      let workerCache = worker.cache.get(owner)
      if (!workerCache) worker.cache.set(owner, (workerCache = new Map()))
      let scopedCache = fileCache.get(owner)
      if (!scopedCache) fileCache.set(owner, (scopedCache = new Map()))

      async function resolve(
        name: string,
        path: FixtureRegistration[],
        parentScope?: 'test' | 'file' | 'worker',
        registration = definitions[name]
      ): Promise<unknown> {
        if (!registration) {
          if (Object.prototype.hasOwnProperty.call(context, name)) {
            if (parentScope === 'file' || parentScope === 'worker')
              throw new Error(
                `${parentScope === 'worker' ? 'Worker' : 'File'} fixture cannot access attempt context "${name}".`
              )
            return context[name]
          }
          throw new Error(`Unknown fixture "${name}".`)
        }
        if (path.includes(registration))
          throw new Error(
            `Circular fixture dependency: ${[
              ...path.map((item) => item.name),
              name,
            ].join(' -> ')}`
          )
        const fixture = normalize(registration)
        if (suiteHook && fixture.scope === 'test')
          throw new Error(
            `Test-scoped fixtures cannot be used inside ${suiteHook} hook. The "${name}" fixture is test-scoped. Use { scope: 'file' } or { scope: 'worker' } fixtures instead.`
          )
        if (parentScope === 'file' && fixture.scope === 'test')
          throw new Error(
            `File fixture cannot depend on test fixture "${name}".`
          )
        if (parentScope === 'worker' && fixture.scope !== 'worker')
          throw new Error(
            `Worker fixture cannot depend on ${fixture.scope} fixture "${name}".`
          )
        const cache =
          fixture.scope === 'worker'
            ? workerCache!
            : fixture.scope === 'file'
              ? scopedCache!
              : testCache
        if (cache.has(registration)) return cache.get(registration)!
        const pending = (async () => {
          if (typeof fixture.value !== 'function') return fixture.value
          const deps: Record<string, unknown> = Object.create(null)
          for (const dependency of dependencies(fixture.value)) {
            const dependencyRegistration =
              dependency === name && registration.parent
                ? registration.parent
                : definitions[dependency]
            deps[dependency] = await resolve(
              dependency,
              [...path, registration],
              fixture.scope,
              dependencyRegistration
            )
          }
          const ready = deferred<unknown>()
          const release = deferred<void>()
          let used = false
          const cleanup = async () => {
            release.resolve()
            await task
          }
          const setup = () =>
            (fixture.value as FixtureFactory)(deps, async (value) => {
              if (used)
                throw new Error(
                  `Fixture "${name}" called use() more than once.`
                )
              used = true
              ;(fixture.scope === 'worker'
                ? workerCleanups!
                : fixture.scope === 'file'
                  ? fileCleanups
                  : cleanups
              ).push(cleanup)
              ready.resolve(value)
              await release.promise
            })
          const task = Promise.resolve().then(() =>
            fixture.scope === 'worker'
              ? worker.run(setup)
              : fixture.scope === 'file'
                ? runFileFixture(setup)
                : setup()
          )
          task.then(() => {
            if (!used)
              ready.reject(new Error(`Fixture "${name}" did not call use().`))
          }, ready.reject)
          return ready.promise
        })().catch((error) => {
          if (cache.get(registration) === pending) cache.delete(registration)
          throw error
        })
        cache.set(registration, pending)
        return pending
      }

      return {
        cleanups,
        async invoke(fn: Function, runCallback?: <T>(fn: () => T) => T) {
          const values = reuseContext
            ? context
            : (Object.defineProperties(
                {},
                Object.fromEntries(
                  Object.entries(Object.getOwnPropertyDescriptors(context)).map(
                    ([name, descriptor]) => [
                      name,
                      { ...descriptor, configurable: true },
                    ]
                  )
                )
              ) as Record<string, unknown>)
          for (const name of Object.keys(definitions))
            if (
              normalize(definitions[name]).auto &&
              (!suiteHook || normalize(definitions[name]).scope !== 'test')
            )
              Object.defineProperty(values, name, {
                configurable: true,
                enumerable: true,
                writable: true,
                value: await resolve(name, []),
              })
          for (const name of dependencies(fn)) {
            // Resolve context accessors only when requested. Merely cloning the
            // context must not switch runner assertion counts to a local expect.
            const value = await resolve(name, [])
            if (
              reuseContext &&
              !definitions[name] &&
              Object.prototype.hasOwnProperty.call(context, name)
            )
              continue
            Object.defineProperty(values, name, {
              configurable: true,
              enumerable: true,
              writable: true,
              value,
            })
          }
          return runCallback ? runCallback(() => fn(values)) : fn(values)
        },
      }
    },
  }
}
