/**
 * Selects and evaluates a shared provider.
 *
 * For `react` with `requiredVersion: "^19.0.0"`, the consumer finds the highest matching entry,
 * calls its `get()` function to obtain a module factory, and then calls that factory to obtain the
 * module namespace. That two-call shape is required when exchanging share scopes with Webpack.
 */
import {
  getShareScope,
  getSharedVersionEntries,
  getSharedVersions,
  initializeSharing,
  type SharedEntry,
} from './share-runtime'
import { parseRange, satisfy, versionLt, type SemVerRange } from './semver'

export interface ConsumeSharedOptions {
  shareScope?: string
  shareKey: string
  requiredVersion?: string | false | null
  strictVersion?: boolean
  singleton?: boolean
  eager?: boolean
  fallback?: () => unknown | Promise<unknown>
}

const parsedRanges = new Map<string, SemVerRange>()

function getParsedRange(requiredVersion: string): SemVerRange {
  let range = parsedRanges.get(requiredVersion)
  if (!range) {
    range = parseRange(requiredVersion)
    parsedRanges.set(requiredVersion, range)
  }
  return range
}

function versionSatisfies(requiredVersion: string, version: string): boolean {
  return satisfy(getParsedRange(requiredVersion), version)
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return Boolean(value) && typeof (value as Promise<T>).then === 'function'
}

function getSharedModule(entry: SharedEntry): unknown | Promise<unknown> {
  entry.loaded = 1
  // A share entry returns a factory, not the module itself: `entry.get()()`.
  const factory = entry.get()
  if (isPromise(factory)) {
    return factory.then((resolvedFactory) => resolvedFactory())
  }
  return factory()
}

type VersionEntry = [version: string, entry: SharedEntry]

function findLatest(entries: VersionEntry[]): VersionEntry | undefined {
  let selected: VersionEntry | undefined
  for (const candidate of entries) {
    if (!selected || versionLt(selected[0], candidate[0])) {
      selected = candidate
    }
  }
  return selected
}

function findSatisfying(
  entries: VersionEntry[],
  requiredVersion: string
): VersionEntry | undefined {
  let selected: VersionEntry | undefined
  for (const candidate of entries) {
    if (
      versionSatisfies(requiredVersion, candidate[0]) &&
      (!selected || versionLt(selected[0], candidate[0]))
    ) {
      selected = candidate
    }
  }
  return selected
}

function findSingleton(entries: VersionEntry[]): VersionEntry | undefined {
  let selected: VersionEntry | undefined
  for (const candidate of entries) {
    if (
      !selected ||
      (!selected[1].loaded && versionLt(selected[0], candidate[0]))
    ) {
      selected = candidate
    }
  }
  return selected
}

function consumeFromScope(options: ConsumeSharedOptions): unknown {
  const {
    shareScope = 'default',
    shareKey,
    strictVersion = false,
    singleton = false,
    eager = false,
    fallback,
  } = options
  const requiredVersion = options.requiredVersion || undefined
  const versions = getSharedVersions(getShareScope(shareScope), shareKey)
  const entries = versions
    ? getSharedVersionEntries(versions).filter(
        ([, entry]) => !eager || entry.eager
      )
    : []

  if (entries.length === 0) {
    if (fallback) return fallback()
    throw new Error(
      `Shared module "${shareKey}" is not available in share scope "${shareScope}"${
        eager ? ' for eager consumption' : ''
      }`
    )
  }

  // Singletons stay on the already-loaded choice. Other shares prefer the highest version which
  // satisfies the requested range, or simply the latest version when no range was configured.
  let selected = singleton
    ? findSingleton(entries)
    : requiredVersion
      ? findSatisfying(entries, requiredVersion)
      : findLatest(entries)

  if (!selected) {
    if (strictVersion) {
      if (fallback) return fallback()
      throw new Error(
        `No satisfying version of shared module "${shareKey}" was found in share scope "${shareScope}" (required ${requiredVersion})`
      )
    }

    selected = findLatest(entries)
  }

  const [version, entry] = selected!
  if (requiredVersion && !versionSatisfies(requiredVersion, version)) {
    const message = `Unsatisfied version ${version} from ${entry.from} of shared${
      singleton ? ' singleton' : ''
    } module ${shareKey} (required ${requiredVersion})`

    if (strictVersion) {
      // Webpack does not use a local fallback for a strict singleton version
      // mismatch; the already-selected singleton remains authoritative.
      if (!singleton && fallback) return fallback()
      throw new Error(message)
    }
    console.warn(message)
  }

  return getSharedModule(entry)
}

export function consumeShared(options: ConsumeSharedOptions): unknown {
  initializeSharing(options.shareScope)
  return consumeFromScope(options)
}

export async function consumeSharedAsync(
  options: ConsumeSharedOptions
): Promise<unknown> {
  initializeSharing(options.shareScope)
  return await consumeFromScope(options)
}
