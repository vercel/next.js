import { unsupported, type Cleanup } from './collector'

type FixtureFactory = (
  context: Record<string, unknown>,
  use: (value: unknown) => Promise<void>
) => Promise<void>
export type FixtureDefinition =
  | unknown
  | [unknown, { scope?: 'test' | 'file'; auto?: boolean }]
export type FixtureDefinitions = Record<string, FixtureDefinition>
type Fixture = { value: unknown; scope: 'test' | 'file'; auto: boolean }

/** The first increment deliberately accepts only plain object destructuring. */
function dependencies(fn: Function): string[] {
  const source = Function.prototype.toString.call(fn)
  const match = source.match(
    /^(?:async\s*)?(?:function(?:\s+\w+)?\s*)?\(\s*\{([^}]*)\}/
  )
  if (!match) {
    if (/^(?:async\s*)?(?:function(?:\s+\w+)?\s*)?\(\s*\)/.test(source))
      return []
    return unsupported('fixture callbacks without plain object destructuring')
  }
  if (!match[1].trim()) return []
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      if (!/^[A-Za-z_$][\w$]*$/.test(name))
        unsupported(
          'fixture destructuring aliases, defaults, or rest properties'
        )
      return name
    })
}

function normalize(definition: FixtureDefinition): Fixture {
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
    return {
      value,
      scope: options.scope ?? 'test',
      auto: options.auto ?? false,
    }
  }
  return { value: definition, scope: 'test', auto: false }
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
  const fileCache = new Map<FixtureDefinitions, Map<string, Promise<unknown>>>()
  const fileCleanups: Cleanup[] = []
  return {
    cleanups: fileCleanups,
    attempt(definitions: FixtureDefinitions, context: Record<string, unknown>) {
      const testCache = new Map<string, Promise<unknown>>()
      const cleanups: Cleanup[] = []
      let scopedCache = fileCache.get(definitions)
      if (!scopedCache) fileCache.set(definitions, (scopedCache = new Map()))

      async function resolve(
        name: string,
        path: string[],
        parentScope?: 'test' | 'file'
      ): Promise<unknown> {
        if (!Object.prototype.hasOwnProperty.call(definitions, name)) {
          if (Object.prototype.hasOwnProperty.call(context, name)) {
            if (parentScope === 'file')
              throw new Error(
                `File fixture cannot access attempt context "${name}".`
              )
            return context[name]
          }
          throw new Error(`Unknown fixture "${name}".`)
        }
        if (path.includes(name))
          throw new Error(
            `Circular fixture dependency: ${[...path, name].join(' -> ')}`
          )
        const fixture = normalize(definitions[name])
        if (parentScope === 'file' && fixture.scope === 'test')
          throw new Error(
            `File fixture cannot depend on test fixture "${name}".`
          )
        const cache = fixture.scope === 'file' ? scopedCache! : testCache
        if (cache.has(name)) return cache.get(name)!
        const pending = (async () => {
          if (typeof fixture.value !== 'function') return fixture.value
          const deps: Record<string, unknown> = {}
          for (const dependency of dependencies(fixture.value))
            deps[dependency] = await resolve(
              dependency,
              [...path, name],
              fixture.scope
            )
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
        cache.set(name, pending)
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
