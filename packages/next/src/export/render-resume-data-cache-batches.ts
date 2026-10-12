import type { ExportPathEntry } from './types'

/**
 * The key used to look up an export path's render resume data cache (RDC) seed
 * in `renderResumeDataCachesByPage`, and to identify the page in logs.
 */
export function getExportPathPageKey({
  page,
  path,
}: Pick<ExportPathEntry, 'page' | 'path'>): string {
  return page !== path ? `${page}: ${path}` : path
}

/**
 * Returns the subset of `renderResumeDataCachesByPage` that is needed to
 * export the given batch, so each export worker only receives the RDC seeds
 * for its own pages instead of the seeds for every page in the build.
 *
 * Returns `undefined` when there is no seed map (e.g. the initial phase).
 */
export function getRenderResumeDataCachesForBatch(
  renderResumeDataCachesByPage: Record<string, string> | undefined,
  batch: ReadonlyArray<Pick<ExportPathEntry, 'page' | 'path'>>
): Record<string, string> | undefined {
  if (!renderResumeDataCachesByPage) {
    return undefined
  }

  const batchRenderResumeDataCaches: Record<string, string> = {}
  for (const exportPath of batch) {
    const pageKey = getExportPathPageKey(exportPath)
    if (Object.hasOwn(renderResumeDataCachesByPage, pageKey)) {
      batchRenderResumeDataCaches[pageKey] =
        renderResumeDataCachesByPage[pageKey]
    }
  }

  return batchRenderResumeDataCaches
}
