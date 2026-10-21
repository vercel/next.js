// Keep direct ordinary-load consumers on the same resolver initialization path.
import '../../../server/require-hook'
import {
  assertTestingDefaultConfiguration,
  type TestingDefaultConfiguration,
} from '../../../server/config-testing-policy'
import {
  observeConfigurationImports,
  retainConfigurationImports,
  captureOriginalConfigurationObserver,
  assertOriginalConfigurationObserver,
  readUnqualifiedRecordedConfigurationImports,
  type OriginalConfigurationObserver,
  type UnqualifiedRecordedConfigurationImports,
} from './config-imports'
import { resolve } from 'path'
import loadConfig from '../../../server/config'
import type { NextConfigComplete } from '../../../server/config-shared'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../../../shared/lib/constants'
import type { TestProfile } from '../contracts'

interface LoadedTestCompilerConfig {
  dir: string
  config: NextConfigComplete
  configurationImports: ReturnType<typeof retainConfigurationImports>
}

declare const originalLoadedObservationBrand: unique symbol
/** A real ordinary load was returned; no atomic graph cut or conversion lease. */
export interface OriginalLoadedConfigurationObservation {
  readonly [originalLoadedObservationBrand]: true
}
interface Observation {
  observer: OriginalConfigurationObserver
  dir: string
  phase: string
  configFile: string | null
  graph: ReturnType<typeof retainConfigurationImports>
  failure?: string
}
type LoadedObservation =
  | { unavailable: string }
  | {
      observation: OriginalLoadedConfigurationObservation
      prototype: object | null
      descriptors: PropertyDescriptor[]
    }
const loadedObservations = new WeakMap<object, LoadedObservation>()
// Tokens never retain a loaded result, config object, Session or native project.
const observations = new WeakMap<
  OriginalLoadedConfigurationObservation,
  Observation
>()
const loadedKeys = ['dir', 'config', 'configurationImports'] as const
const freezeOriginalObservation = Object.freeze

function rememberOriginalLoad(
  loaded: LoadedTestCompilerConfig,
  observer: OriginalConfigurationObserver,
  phase: string,
  configFile: string | null
): void {
  const observation = {
    __proto__: null,
  } as unknown as OriginalLoadedConfigurationObservation
  freezeOriginalObservation(observation)
  observations.set(observation, {
    observer,
    dir: loaded.dir,
    phase,
    configFile,
    graph: loaded.configurationImports,
  })
  loadedObservations.set(loaded, {
    observation,
    prototype: Object.getPrototypeOf(loaded),
    descriptors: loadedKeys.map(
      (key) => Object.getOwnPropertyDescriptor(loaded, key)!
    ),
  })
}
function sameDescriptor(
  actual: PropertyDescriptor | undefined,
  original: PropertyDescriptor
): boolean {
  return (
    !!actual &&
    ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'].every(
      (key) =>
        Object.hasOwn(actual, key) === Object.hasOwn(original, key) &&
        Object.is(
          actual[key as keyof PropertyDescriptor],
          original[key as keyof PropertyDescriptor]
        )
    )
  )
}
function assertOriginalLoaded(
  loaded: object,
  retained: Exclude<LoadedObservation, { unavailable: string }>
): void {
  if (
    Object.getPrototypeOf(loaded) !== retained.prototype ||
    Reflect.ownKeys(loaded).length !== loadedKeys.length ||
    !loadedKeys.every((key, index) =>
      sameDescriptor(
        Object.getOwnPropertyDescriptor(loaded, key),
        retained.descriptors[index]
      )
    )
  )
    throw new Error('Original Next config loaded result changed.')
}
function findLoaded(value: unknown): LoadedObservation | undefined {
  return value && typeof value === 'object'
    ? loadedObservations.get(value)
    : undefined
}

/** Unknown and explicitly unavailable results cannot be retrospectively adopted. */
export function lookupOriginalConfigurationObservation(
  loaded: unknown
): OriginalLoadedConfigurationObservation | undefined {
  const retained = findLoaded(loaded)
  if (!retained || 'unavailable' in retained) return undefined
  assertOriginalLoaded(loaded as object, retained)
  const original = observations.get(retained.observation)
  if (!original || original.failure) return undefined
  return retained.observation
}

/** Fresh recorded-edge data only; this never establishes a final module cut. */
export async function readUnqualifiedRecordedConfigurationGraph(
  loaded: unknown,
  observation: OriginalLoadedConfigurationObservation,
  signal: AbortSignal
): Promise<UnqualifiedRecordedConfigurationImports> {
  signal.throwIfAborted()
  const retained = findLoaded(loaded)
  if (!retained || 'unavailable' in retained)
    throw new Error(
      'Original Next config load provenance unavailable: ' +
        (retained && 'unavailable' in retained
          ? retained.unavailable
          : 'unknown loaded result')
    )
  if (retained.observation !== observation)
    throw new Error('Foreign original Next config observation.')
  const original = observations.get(observation)
  if (!original || original.failure)
    throw new Error('Original Next config observation unavailable.')
  const check = () => {
    signal.throwIfAborted()
    assertOriginalLoaded(loaded as object, retained)
    assertOriginalConfigurationObserver(original.observer)
  }
  check()
  try {
    await original.graph
  } catch (error) {
    original.failure = 'original retained graph rejected'
    throw error
  }
  check()
  const result = await readUnqualifiedRecordedConfigurationImports(
    original.observer,
    original.configFile,
    signal
  )
  check()
  return result
}

/** Keep compiler and watch metadata on the same supported configuration path. */
export function validateTestProfile(profile: TestProfile): void {
  if (
    !['rsc', 'node', 'browser'].includes(profile.environment) ||
    !['development', 'production'].includes(profile.mode) ||
    profile.runtime !== 'nodejs' ||
    profile.bundler !== 'turbopack' ||
    (profile.browserClient !== undefined &&
      (profile.browserClient !== true ||
        profile.environment !== 'browser' ||
        profile.route !== undefined)) ||
    (profile.route !== undefined &&
      (profile.environment !== 'rsc' ||
        !profile.route.startsWith('/') ||
        profile.route.includes('?') ||
        profile.route.includes('#')))
  ) {
    throw new Error(
      'The test compiler supports route-less development or production entries and one-shot Node RSC AppProject routes with Turbopack only'
    )
  }
}

export async function loadTestCompilerConfig(
  projectDir: string,
  profile: TestProfile,
  testingDefaultConfiguration?: TestingDefaultConfiguration
): Promise<LoadedTestCompilerConfig> {
  assertTestingDefaultConfiguration(testingDefaultConfiguration)
  if (
    testingDefaultConfiguration !== undefined &&
    (profile.mode !== 'production' || profile.environment !== 'node')
  ) {
    throw new Error(
      'ERR_NEXT_TEST_DEFAULT_CONFIGURATION: only production Node configuration is available'
    )
  }
  validateTestProfile(profile)
  if (process.env.NODE_ENV && process.env.NODE_ENV !== profile.mode) {
    throw new Error(
      `Test compilation for ${profile.mode} requires NODE_ENV=${profile.mode}`
    )
  }
  const dir = resolve(projectDir)
  observeConfigurationImports()
  let observer: OriginalConfigurationObserver | undefined
  let unavailable = 'original observer provenance unavailable'
  try {
    observer = captureOriginalConfigurationObserver()
  } catch {
    unavailable = 'original observer provenance capture failed'
  }
  const phase =
    profile.mode === 'development'
      ? PHASE_DEVELOPMENT_SERVER
      : PHASE_PRODUCTION_BUILD
  const config =
    testingDefaultConfiguration === undefined
      ? await loadConfig(phase, dir)
      : await loadConfig(phase, dir, { testingDefaultConfiguration })
  const configFile = config.configFile ?? null
  const loaded = {
    dir,
    config,
    configurationImports: retainConfigurationImports(config, configFile),
  }
  // Metadata is dormant. It cannot turn a successful ordinary load into failure.
  try {
    if (observer) rememberOriginalLoad(loaded, observer, phase, configFile)
    else loadedObservations.set(loaded, { unavailable })
  } catch {
    try {
      loadedObservations.set(loaded, {
        unavailable: 'original load provenance recording failed',
      })
    } catch {
      // An unknown result remains unavailable to every dormant consumer.
    }
  }
  return loaded
}
