import type { ServerRuntime } from '../../types'

export interface PageInfo {
  isHybridAmp?: boolean
  size: number
  totalSize: number
  isStatic: boolean
  isSSG: boolean
  isPPR: boolean
  ssgPageRoutes: string[] | null
  initialRevalidateSeconds: number | false
  pageDuration: number | undefined
  ssgPageDurations: number[] | undefined
  runtime: ServerRuntime
  hasEmptyPrelude?: boolean
  hasPostponed?: boolean
  isDynamicAppRoute?: boolean
}

/**
 * Updates the page info for a given page. If the page info doesn't exist, it
 * will throw an error.
 *
 * @param pageInfos the page infos map
 * @param page the page to update
 * @param update the update to apply
 * @returns the updated page info
 */
export function patchPageInfos(
  pageInfos: Map<string, PageInfo>,
  page: string,
  update: Partial<PageInfo>
): PageInfo {
  const pageInfo = pageInfos.get(page)
  if (!pageInfo) {
    throw new Error(`Invariant: Expected page "${page}" to exist`)
  }

  // Patch the page info with the update.
  Object.assign(pageInfo, update)

  return pageInfo
}
