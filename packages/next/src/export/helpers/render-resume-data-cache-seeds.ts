import type { ExportPagesResult, ExportPathEntry } from '../types'
import type { Params } from '../../server/request/params'
import { getParams } from './get-params'
import { isDynamicRoute } from '../../shared/lib/router/utils/is-dynamic'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'

function getPageKey(page: string, path: string): string {
  return page !== path ? `${page}: ${path}` : path
}

function getKnownParamsKey(
  normalizedPage: string,
  path: string,
  fallbackParamNames: Set<string>
): string | null {
  let params: Params
  try {
    params = getParams(normalizedPage, path)
  } catch {
    return null
  }

  // Only keep params that are known, then sort
  // for a stable key so we can match a compatible seed.
  const entries = Object.entries(params).filter(
    ([key]) => !fallbackParamNames.has(key)
  )

  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

/**
 * Picks an RDC seed for each fallback shell by matching on the params that
 * are already known, so fallback shells use a seed that has already computed
 * those known params (e.g. /en/... fallback shells don't get seeded with
 * /fr/... data).
 *
 * Seeds are picked before the initial phase and marked with `_isRDCSeed`, so
 * that only their serialized RDC is sent back from the export workers. The
 * result of a worker batch is sent as a single message, and the RDC of every
 * page in it could exceed the maximum string length of V8.
 *
 * @returns the page key of the seed by the page key of the fallback shell
 */
export function selectRDCSeeds(
  initialPhaseExportPaths: ExportPathEntry[],
  finalPhaseExportPaths: ExportPathEntry[]
): Map<string, string> {
  const candidatesByPage = new Map<string, ExportPathEntry[]>()
  for (const exportPath of initialPhaseExportPaths) {
    const candidates = candidatesByPage.get(exportPath.page) ?? []
    candidates.push(exportPath)
    candidatesByPage.set(exportPath.page, candidates)
  }

  const seeds = new Map<string, string>()
  for (const exportPath of finalPhaseExportPaths) {
    const { page, path, _fallbackRouteParams = [] } = exportPath
    if (!isDynamicRoute(page)) {
      continue
    }

    const candidates = candidatesByPage.get(page)
    if (!candidates) {
      continue
    }

    // Normalize app pages before param matching.
    const normalizedPage = normalizeAppPath(page)
    const fallbackParamNames = new Set(
      _fallbackRouteParams.map((param) => param.paramName)
    )
    // Build a key from the known params for this fallback shell so we can
    // select a seed from a compatible prerendered route.
    const targetKey = getKnownParamsKey(
      normalizedPage,
      path,
      fallbackParamNames
    )
    if (!targetKey) {
      continue
    }

    const seed = candidates.find(
      (candidate) =>
        getKnownParamsKey(
          normalizedPage,
          candidate.path,
          fallbackParamNames
        ) === targetKey
    )
    if (seed) {
      seed._isRDCSeed = true
      seeds.set(getPageKey(page, path), getPageKey(seed.page, seed.path))
    }
  }

  return seeds
}

/**
 * Maps the page key of each fallback shell to the serialized Resume Data Cache
 * of its seed from the initial phase results.
 */
export function buildRDCCacheByPage(
  results: ExportPagesResult,
  seeds: Map<string, string>
): Record<string, string> {
  const renderResumeDataCachesBySeed = new Map<string, string>()
  for (const { pageKey, result } of results) {
    if (result && 'renderResumeDataCache' in result) {
      if (result.renderResumeDataCache) {
        renderResumeDataCachesBySeed.set(pageKey, result.renderResumeDataCache)
      }
      // Remove the RDC string from the result so that it can be garbage
      // collected.
      result.renderResumeDataCache = undefined
    }
  }

  const renderResumeDataCachesByPage: Record<string, string> = {}
  for (const [fallbackPageKey, seedPageKey] of seeds) {
    const renderResumeDataCache = renderResumeDataCachesBySeed.get(seedPageKey)
    if (renderResumeDataCache) {
      renderResumeDataCachesByPage[fallbackPageKey] = renderResumeDataCache
    }
  }

  return renderResumeDataCachesByPage
}
