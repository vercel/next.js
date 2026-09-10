import {
  PRERENDER_PARAM_MODES,
  type AppSegment,
  type PrerenderMatcher,
  type PrerenderParamMode,
} from '../segment-config/app/app-segments'
import type { FallbackRouteParam } from './types'
import { FallbackMode } from '../../lib/fallback'
import { isPlainObject } from '../../shared/lib/is-plain-object'

function getValueType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function isPrerenderParamMode(value: unknown): value is PrerenderParamMode {
  return PRERENDER_PARAM_MODES.includes(value as PrerenderParamMode)
}

function isTreePathPrefix(
  prefix: readonly string[],
  value: readonly string[]
): boolean {
  if (prefix.length > value.length) return false
  for (let index = 0; index < prefix.length; index++) {
    if (prefix[index] !== value[index]) return false
  }
  return true
}

function validateMatcherExport(
  page: string,
  segment: Readonly<AppSegment>,
  value: unknown,
  routeParamNames: ReadonlySet<string>
): PrerenderMatcher {
  const exportName =
    segment.prerenderMatcher?.kind === 'generated'
      ? 'experimental_generateParamMatching'
      : 'experimental_paramMatching'

  if (!isPlainObject(value)) {
    throw new Error(
      `Invalid value from \`${exportName}\` for "${page}". Expected an object, but received ${getValueType(value)}.`
    )
  }

  const visibleParamNames = new Set(segment.prerenderMatcher!.visibleParamNames)
  const matcher: PrerenderMatcher = {}
  for (const [paramName, mode] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (!routeParamNames.has(paramName)) {
      throw new Error(
        `Invalid parameter "${paramName}" in \`${exportName}\` for "${page}". Matchers may only configure dynamic parameters in this route.`
      )
    }
    if (!visibleParamNames.has(paramName)) {
      throw new Error(
        `Invalid parameter "${paramName}" in \`${exportName}\` for "${page}". The export in "${segment.filePath}" may only configure parameters defined at or above its segment.`
      )
    }
    if (!isPrerenderParamMode(mode)) {
      throw new Error(
        `Invalid mode for parameter "${paramName}" in \`${exportName}\` for "${page}". Expected "not-found", "blocking", "fallback", or "dynamic", but received ${JSON.stringify(mode)}.`
      )
    }
    matcher[paramName] = mode
  }

  return matcher
}

type MatcherCandidate = {
  readonly mode: PrerenderParamMode
  readonly filePath: string | undefined
  readonly treePath: readonly string[]
}

export async function compilePrerenderMatcher(
  page: string,
  segments: readonly Readonly<AppSegment>[],
  pathnameSegments: ReadonlyArray<{ readonly paramName: string }>
): Promise<PrerenderMatcher | undefined> {
  const matcherSegments = segments.filter(
    (segment) => segment.prerenderMatcher !== undefined
  )

  if (matcherSegments.length === 0) return undefined

  if (segments.some((segment) => segment.config?.dynamicParams !== undefined)) {
    throw new Error(
      `Route "${page}" cannot combine \`dynamicParams\` with \`experimental_paramMatching\` or \`experimental_generateParamMatching\`.`
    )
  }

  const routeParamNames = new Set(
    pathnameSegments.map(({ paramName }) => paramName)
  )
  const candidates = new Map<string, MatcherCandidate[]>()
  const fragments = await Promise.all(
    matcherSegments.map(async (segment) => {
      const matcherExport = segment.prerenderMatcher!
      const value =
        matcherExport.kind === 'static'
          ? matcherExport.value
          : await matcherExport.generate()
      return validateMatcherExport(page, segment, value, routeParamNames)
    })
  )

  // Include branches without matching exports: they still inherit their
  // ancestors' policies. An override in one branch must not erase that intent
  // from a sibling. Keep module evaluation above separate from tree occurrences
  // so a shared generator is still called only once.
  const treePaths = segments.flatMap((segment) => segment.treePaths)
  const branchPaths = treePaths.filter(
    (treePath) =>
      !treePaths.some(
        (other) =>
          other.length > treePath.length && isTreePathPrefix(treePath, other)
      )
  )
  for (const branchPath of branchPaths) {
    const branchCandidates = new Map<string, MatcherCandidate>()
    for (let index = 0; index < matcherSegments.length; index++) {
      const segment = matcherSegments[index]
      for (const treePath of segment.treePaths) {
        if (!isTreePathPrefix(treePath, branchPath)) continue

        for (const [paramName, mode] of Object.entries(fragments[index])) {
          const inherited = branchCandidates.get(paramName)
          if (!inherited || inherited.treePath.length < treePath.length) {
            branchCandidates.set(paramName, {
              mode,
              filePath: segment.filePath,
              treePath,
            })
          }
        }
      }
    }

    for (const [paramName, candidate] of branchCandidates) {
      const parallelCandidates = candidates.get(paramName)
      if (!parallelCandidates) {
        candidates.set(paramName, [candidate])
      } else if (
        !parallelCandidates.some(({ mode }) => mode === candidate.mode)
      ) {
        parallelCandidates.push(candidate)
      }
    }
  }

  const policy: PrerenderMatcher = {}
  for (const { paramName } of pathnameSegments) {
    const paramCandidates = candidates.get(paramName)
    if (!paramCandidates) continue
    const mode = paramCandidates[0].mode
    if (paramCandidates.some((candidate) => candidate.mode !== mode)) {
      const definitions = paramCandidates
        .map(
          (candidate) =>
            `${candidate.filePath ?? '<unknown module>'} (${candidate.mode})`
        )
        .join(', ')
      throw new Error(
        `Route "${page}" has conflicting parallel parameter matching modes for parameter "${paramName}": ${definitions}.`
      )
    }
    policy[paramName] = mode
  }

  let previousPhase = -1
  let previousParamName: string | undefined
  for (const { paramName } of pathnameSegments) {
    const mode = policy[paramName]
    if (!mode) continue
    const currentPhase = PRERENDER_PARAM_MODES.indexOf(mode)
    if (currentPhase < previousPhase) {
      throw new Error(
        `Invalid parameter matching for "${page}": parameter "${paramName}" uses "${mode}" after parameter "${previousParamName}" uses a later matching phase. Expected parameters to follow not-found, blocking, fallback, then dynamic order.`
      )
    }
    previousPhase = currentPhase
    previousParamName = paramName
  }

  return policy
}

export function getPrerenderMatcherFallbackMode(
  matcher: Readonly<PrerenderMatcher>,
  fallbackRouteParams: readonly Pick<FallbackRouteParam, 'paramName'>[],
  inferredFallbackMode: FallbackMode | undefined,
  rootParamKeys: ReadonlySet<string>
): FallbackMode | undefined {
  let hasInferredBlockingRoot = false
  for (const { paramName } of fallbackRouteParams) {
    switch (matcher[paramName]) {
      case undefined:
        if (rootParamKeys.has(paramName)) hasInferredBlockingRoot = true
        break
      case 'not-found':
        return FallbackMode.NOT_FOUND
      case 'blocking':
        return FallbackMode.BLOCKING_STATIC_RENDER
      case 'fallback':
      case 'dynamic':
        return hasInferredBlockingRoot
          ? FallbackMode.BLOCKING_STATIC_RENDER
          : FallbackMode.PRERENDER
    }
  }

  // Root parameters retain their existing blocking inference. Keep walking
  // above so a later explicit not-found can still reject the whole match.
  return hasInferredBlockingRoot
    ? FallbackMode.BLOCKING_STATIC_RENDER
    : inferredFallbackMode
}

export function validatePrerenderMatcherParams(
  page: string,
  matcher: Readonly<PrerenderMatcher>,
  generatedParamNames: ReadonlySet<string>,
  missingParamNames: ReadonlySet<string>,
  pathnameSegments: ReadonlyArray<{ readonly paramName: string }>,
  output: 'export' | 'standalone' | undefined
): void {
  let dynamicParamName: string | undefined
  for (const { paramName } of pathnameSegments) {
    const mode = matcher[paramName]
    if (mode === 'dynamic') dynamicParamName = paramName
    if (dynamicParamName && generatedParamNames.has(paramName)) {
      throw new Error(
        `Route "${page}" cannot prerender parameter "${paramName}" because parameter "${dynamicParamName}" is configured as "dynamic".`
      )
    }
    if (mode === 'not-found' && missingParamNames.has(paramName)) {
      throw new Error(
        `Route "${page}" configures parameter "${paramName}" as "not-found", but generateStaticParams returned a result without that parameter.`
      )
    }
    if (output === 'export' && mode !== 'not-found') {
      throw new Error(
        `Route "${page}" must configure parameter "${paramName}" as "not-found" when using experimental parameter matching with "output: export".`
      )
    }
  }
}
