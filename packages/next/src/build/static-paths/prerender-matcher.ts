import {
  PRERENDER_PARAM_MODES,
  type AppSegment,
  type AppSegmentTree,
  type PrerenderMatcher,
  type PrerenderParamMode,
} from '../segment-config/app/app-segments'
import type { FallbackRouteParam } from './types'
import { FallbackMode } from '../../lib/fallback'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { getSegmentParam } from '../../shared/lib/router/utils/get-segment-param'

type MatcherCandidate = {
  readonly mode: PrerenderParamMode
  readonly filePath: string | undefined
}

export async function compilePrerenderMatcher(
  page: string,
  segmentTree: readonly AppSegmentTree[],
  pathnameSegments: ReadonlyArray<{ readonly paramName: string }>
): Promise<PrerenderMatcher | undefined> {
  const segments = new Set<AppSegment>()
  const nodes = [...segmentTree]
  for (let index = 0; index < nodes.length; index++) {
    const [segment, children] = nodes[index]
    segments.add(segment)
    nodes.push(...children)
  }
  const matcherSegments = [...segments].filter(
    (segment) => segment.prerenderMatcher !== undefined
  )

  if (matcherSegments.length === 0) return undefined

  if (
    [...segments].some((segment) => segment.config?.dynamicParams !== undefined)
  ) {
    throw new Error(
      `Route "${page}" cannot combine \`dynamicParams\` with \`experimental_paramMatching\` or \`experimental_generateParamMatching\`.`
    )
  }

  const routeParamNames = new Set(
    pathnameSegments.map(({ paramName }) => paramName)
  )
  const candidates = new Map<string, MatcherCandidate[]>()
  const paramsMissingPolicy = new Set<string>()
  // A module can appear in multiple parallel slots in the loader tree. Those
  // occurrences share an AppSegment, so invoke its generator once and reuse
  // the result wherever that module occurs. Start independent generators
  // together, before merging their results down each branch.
  const fragments = new Map<AppSegment, PrerenderMatcher>()
  await Promise.all(
    matcherSegments.map(async (segment) => {
      const matcherExport = segment.prerenderMatcher!
      const value =
        typeof matcherExport === 'function'
          ? await matcherExport()
          : matcherExport
      for (const paramName of Object.keys(value)) {
        if (!routeParamNames.has(paramName)) {
          const exportName =
            typeof matcherExport === 'function'
              ? 'experimental_generateParamMatching'
              : 'experimental_paramMatching'
          throw new Error(
            `Invalid parameter "${paramName}" in \`${exportName}\` for "${page}". Matchers may only configure dynamic parameters in this route.`
          )
        }
      }
      fragments.set(segment, value)
    })
  )

  function visit(
    [segment, children]: AppSegmentTree,
    inherited: ReadonlyMap<string, MatcherCandidate>,
    paramNames: readonly string[]
  ) {
    const branchCandidates = new Map(inherited)
    const fragment = fragments.get(segment)
    if (fragment) {
      for (const [paramName, mode] of Object.entries(fragment)) {
        branchCandidates.set(paramName, { mode, filePath: segment.filePath })
      }
    }
    if (segment.paramName) paramNames = [...paramNames, segment.paramName]

    if (children.length > 0) {
      for (const child of children) visit(child, branchCandidates, paramNames)
      return
    }

    // Compare the effective policies at every leaf, including leaves without
    // exports. A sibling's override must not erase this branch's inheritance.
    for (const paramName of paramNames) {
      if (!branchCandidates.has(paramName)) {
        paramsMissingPolicy.add(paramName)
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
  for (const root of segmentTree) visit(root, new Map(), [])

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
    if (mode === 'not-found' && paramsMissingPolicy.has(paramName)) {
      throw new Error(
        `Parameter "${paramName}" in route "${page}" uses "not-found" in one parallel branch, but another branch has no explicit policy. Every parallel branch sharing this parameter must explicitly configure "not-found", either directly or through an inherited layout.`
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
        `Invalid parameter matching for "${page}": parameter "${paramName}" uses "${mode}" after parameter "${previousParamName}" uses a later matching phase. Expected parameters in this order: "not-found", "blocking", "fallback", then "dynamic".`
      )
    }
    previousPhase = currentPhase
    previousParamName = paramName
  }

  return policy
}

/**
 * Validate closure after every page's policies have been evaluated and merged.
 * Compare parameter positions, not names: /blog/[slug] and /shop/[slug] are
 * independent, while route groups and parallel slots do not change a position.
 */
export function validatePrerenderMatcherCoherence(
  matchers: ReadonlyMap<string, PrerenderMatcher | undefined>
): void {
  const parameters = new Map<string, [route: string, notFound: boolean]>()

  for (const [appPath, matcher] of [...matchers].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const route = normalizeAppPath(appPath)
    let prefix = ''
    for (const segment of route.split('/')) {
      if (!segment) continue
      prefix += `/${segment}`
      const param = getSegmentParam(segment)
      if (!param) continue

      const notFound = matcher?.[param.paramName] === 'not-found'
      const previous = parameters.get(prefix)
      if (previous === undefined) {
        parameters.set(prefix, [route, notFound])
      } else if (previous[1] !== notFound) {
        const closedRoute = notFound ? route : previous[0]
        const openRoute = notFound ? previous[0] : route
        throw new Error(
          `Parameter "${param.paramName}" at "${prefix}" uses "not-found" in route "${closedRoute}". Route "${openRoute}" must explicitly configure "not-found" for this parameter, either directly or through an inherited layout.`
        )
      }
    }
  }
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
