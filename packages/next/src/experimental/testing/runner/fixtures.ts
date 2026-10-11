import { unsupported, type Cleanup } from './collector'

type FixtureFactory = (
  context: Record<string, unknown>,
  use: (value: unknown) => Promise<void>
) => Promise<void>
export type FixtureDefinition =
  | unknown
  | [unknown, { scope?: 'test' | 'file'; auto?: boolean }]
export interface FixtureRegistration {
  name: string
  definition: FixtureDefinition
  parent?: FixtureRegistration
}
export type FixtureDefinitions = Record<string, FixtureRegistration>
type Fixture = {
  value: unknown
  scope: 'test' | 'file'
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

export function extendFixtures(
  base: FixtureDefinitions,
  extra: Record<string, FixtureDefinition>
): FixtureDefinitions {
  const definitions = { ...base }
  for (const [name, definition] of Object.entries(extra)) {
    definitions[name] = {
      name,
      definition,
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
      if (!/^[A-Za-z_$][\w$]*$/.test(name))
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
      if (key !== 'scope' && key !== 'auto')
        unsupported(`fixture option "${key}"`)
    if (
      options.scope !== undefined &&
      options.scope !== 'test' &&
      options.scope !== 'file'
    )
      unsupported(`fixture scope "${options.scope}"`)
    if (parent && options.scope !== undefined && options.scope !== parent.scope)
      throw new Error(
        `The "${registration.name}" fixture was already registered with a "${parent.scope}" scope.`
      )
    if (parent && options.auto !== undefined && options.auto !== parent.auto)
      throw new Error(
        `The "${registration.name}" fixture was already registered as { auto: ${parent.auto} }.`
      )
    return {
      value,
      scope: options.scope ?? parent?.scope ?? 'test',
      auto: options.auto ?? parent?.auto ?? false,
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

export function createFixtureFile(
  runFileFixture: <T>(fn: () => T) => T = (fn) => fn()
) {
  const fileCache = new Map<
    FixtureDefinitions,
    Map<FixtureRegistration, Promise<unknown>>
  >()
  const fileCleanups: Cleanup[] = []
  return {
    cleanups: fileCleanups,
    attempt(definitions: FixtureDefinitions, context: Record<string, unknown>) {
      const testCache = new Map<FixtureRegistration, Promise<unknown>>()
      const cleanups: Cleanup[] = []
      let scopedCache = fileCache.get(definitions)
      if (!scopedCache) fileCache.set(definitions, (scopedCache = new Map()))

      async function resolve(
        name: string,
        path: FixtureRegistration[],
        parentScope?: 'test' | 'file',
        registration = definitions[name]
      ): Promise<unknown> {
        if (!registration) {
          if (Object.prototype.hasOwnProperty.call(context, name)) {
            if (parentScope === 'file')
              throw new Error(
                `File fixture cannot access attempt context "${name}".`
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
        if (parentScope === 'file' && fixture.scope === 'test')
          throw new Error(
            `File fixture cannot depend on test fixture "${name}".`
          )
        const cache = fixture.scope === 'file' ? scopedCache! : testCache
        if (cache.has(registration)) return cache.get(registration)!
        const pending = (async () => {
          if (typeof fixture.value !== 'function') return fixture.value
          const deps: Record<string, unknown> = {}
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
          const setup = () =>
            (fixture.value as FixtureFactory)(deps, async (value) => {
              if (used)
                throw new Error(
                  `Fixture "${name}" called use() more than once.`
                )
              used = true
              ready.resolve(value)
              await release.promise
            })
          const task = Promise.resolve().then(() =>
            fixture.scope === 'file' ? runFileFixture(setup) : setup()
          )
          task.then(() => {
            if (!used)
              ready.reject(new Error(`Fixture "${name}" did not call use().`))
          }, ready.reject)
          const cleanup = async () => {
            release.resolve()
            await task
          }
          ;(fixture.scope === 'file' ? fileCleanups : cleanups).push(cleanup)
          return ready.promise
        })()
        cache.set(registration, pending)
        return pending
      }

      return {
        cleanups,
        async invoke(fn: Function) {
          const values = { ...context }
          for (const name of Object.keys(definitions))
            if (normalize(definitions[name]).auto)
              values[name] = await resolve(name, [])
          for (const name of dependencies(fn))
            values[name] = await resolve(name, [])
          return fn(values)
        },
      }
    },
  }
}
