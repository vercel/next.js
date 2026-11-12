type Scalar = string | number | boolean
type Argument = Scalar | Scalar[]
type Key = 'typecheck' | 'enabled' | 'only' | 'spawnTimeout'

export interface TestTypecheckCliOptions {
  enabled?: boolean
  only?: boolean
  spawnTimeout?: Scalar
}

/** Preserve the pinned parser's sparse, ordered typecheck CLI overrides. */
export function createTestTypecheckCliArguments() {
  const argumentsByKey = new Map<Key, Argument>()

  function record(key: Key, value: Scalar, negated = false) {
    const previous = argumentsByKey.get(key)
    argumentsByKey.set(
      key,
      negated || previous === undefined
        ? value
        : [...(Array.isArray(previous) ? previous : [previous]), value]
    )
  }

  function timeout(value: string | boolean | null | undefined) {
    if (value === undefined || value === null || typeof value === 'boolean') {
      record(
        'spawnTimeout',
        value === undefined || value === null ? true : value
      )
      return
    }
    const number = Number(value)
    record('spawnTimeout', number * 0 === 0 ? number : value)
  }

  function scalar(key: Key, value: Argument): Scalar {
    if (Array.isArray(value)) {
      const command =
        key === 'typecheck'
          ? '--typecheck '
          : key === 'enabled'
            ? '--typecheck.enabled'
            : key === 'spawnTimeout'
              ? '--typecheck.spawnTimeout <time>'
              : '--typecheck.only'
      const received = value
        .map((item) => (typeof item === 'string' ? `"${item}"` : item))
        .join(', ')
      throw new Error(
        `Expected a single value for option "${command}", received [${received}]`
      )
    }
    if (
      typeof value === 'string' &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    )
      return value.slice(1, -1)
    return value
  }

  function resolve(argv: readonly string[] = []): TestTypecheckCliOptions {
    let options: TestTypecheckCliOptions = {}
    // Map insertion order matches the first occurrence of each MRI option key.
    // Negation replaces a value without moving that key after later options.
    for (const [key, value] of argumentsByKey) {
      const selected = scalar(key, value)
      if (key === 'typecheck') options = { enabled: selected as boolean }
      else if (key === 'enabled') options.enabled = selected as boolean
      else if (key === 'only') options.only = selected as boolean
      else options.spawnTimeout = selected
    }
    for (let index = 0; index < argv.length; index++) {
      if (argv[index] === '--') break
      if (
        argv[index] === '--typecheck.spawnTimeout' &&
        /^-(?:\d|\.\d)/.test(argv[index + 1] ?? '')
      )
        throw new Error(`Unknown option \`-${argv[index + 1][1]}\``)
    }
    if (typeof options.only === 'boolean') options.enabled ??= true
    return options
  }

  return {
    enabled: (value: boolean, negated = false) =>
      record('typecheck', value, negated),
    dottedEnabled: (value: boolean, negated = false) =>
      record('enabled', value, negated),
    only: (value: boolean, negated = false) => record('only', value, negated),
    timeout,
    noTimeout: () => record('spawnTimeout', false, true),
    resolve,
  }
}
