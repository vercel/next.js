/** Internal refusal-only policy. This never supplies native or client authority. */
export type TestingDefaultConfiguration = 'default-only'

function refuse(reason: string): never {
  throw new Error('ERR_NEXT_TEST_DEFAULT_CONFIGURATION: ' + reason)
}

export function assertTestingDefaultConfiguration(
  value: unknown
): asserts value is TestingDefaultConfiguration | undefined {
  if (value !== undefined && value !== 'default-only') {
    refuse('unknown refusal policy')
  }
}

/** Read the optional request without executing its own accessor. */
export function readTestingDefaultConfiguration(
  options: object
): TestingDefaultConfiguration | undefined {
  const property = Object.getOwnPropertyDescriptor(
    options,
    'testingDefaultConfiguration'
  )
  if (!property) {
    if ('testingDefaultConfiguration' in options) {
      refuse('the refusal policy must be own data')
    }
    return undefined
  }
  if (!Object.hasOwn(property, 'value') || !property.enumerable) {
    refuse('the refusal policy must be enumerable data')
  }
  assertTestingDefaultConfiguration(property.value)
  return property.value
}

/** Only a requested policy takes this new data snapshot. */
export function captureTestingDefaultLoadOptions<T extends object>(
  options: T
): T {
  const prototype = Object.getPrototypeOf(options)
  if (prototype !== Object.prototype && prototype !== null) {
    refuse('load options must be plain data')
  }
  const keys = new Set([
    'testingDefaultConfiguration',
    'customConfig',
    'rawConfig',
    'silent',
    'reportExperimentalFeatures',
    'reactProductionProfiling',
    'debugPrerender',
    'bundler',
  ])
  const captured = {} as T
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !keys.has(key)) {
      refuse('unknown load option')
    }
    const property = Object.getOwnPropertyDescriptor(options, key)!
    if (!Object.hasOwn(property, 'value') || !property.enumerable) {
      refuse('load options must be enumerable data')
    }
    Object.defineProperty(captured, key, {
      value: property.value,
      enumerable: true,
    })
  }
  Object.freeze(captured)
  return captured
}

/** Presence checks only. These cannot certify earlier startup or cached bindings. */
export function assertTestingDefaultConfigurationEnvironment(
  policy: TestingDefaultConfiguration | undefined
): void {
  assertTestingDefaultConfiguration(policy)
  if (policy === undefined) return
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    '__INTERNAL_CUSTOM_TURBOPACK_BINDINGS',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    'NEXT_TEST_WASM',
    'NEXT_TEST_WASM_DIR',
    'NEXT_DISABLE_SWC_WASM',
    'NEXT_MINIMAL',
    'NEXT_RSPACK',
    'NEXT_PRIVATE_LOCAL_WEBPACK',
    '__NEXT_PRIVATE_STANDALONE_CONFIG',
    '__NEXT_PRIVATE_RENDER_WORKER',
    'BROWSERSLIST',
    'BROWSERSLIST_CONFIG',
    'BROWSERSLIST_ENV',
    'BROWSERSLIST_DANGEROUS_EXTEND',
    'BROWSERSLIST_ROOT_PATH',
    'BROWSERSLIST_STATS',
  ]) {
    if (Object.hasOwn(process.env, name)) {
      refuse('unsupported environment selector: ' + name)
    }
  }
  if (
    Object.hasOwn(process.env, 'NEXT_RUNTIME') &&
    process.env.NEXT_RUNTIME !== 'nodejs'
  ) {
    refuse('unsupported environment selector: NEXT_RUNTIME')
  }
}

/** Refuse the actual adapter selection before reading or importing an adapter. */
export function assertTestingDefaultConfigurationAdapter(
  config: object,
  policy: TestingDefaultConfiguration | undefined
): void {
  if (policy === undefined) return
  const property = Object.getOwnPropertyDescriptor(config, 'adapterPath')
  if (
    (property &&
      (!Object.hasOwn(property, 'value') || property.value !== undefined)) ||
    (!property && 'adapterPath' in config)
  ) {
    refuse('project adapters are unavailable')
  }
}
