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
 * This class is used to store information about pages that is used for the
 * build output.
 */

export class PageInfoRegistry extends Map<string, PageInfo> {
  /**
   * Updates the page info for a given page. If the page info doesn't exist,
   * then it will throw an error.
   *
   * @param page the page to update
   * @param update the update to apply
   * @returns the updated page info
   */
  public patch(page: string, update: Partial<PageInfo>): PageInfo {
    const pageInfo = this.get(page, true)
    this.set(page, { ...pageInfo, ...update })
    return pageInfo
  }

  /**
   * Gets the page info for a given page. If the page info doesn't exist, then
   * it will throw an error if `errorIfMissing` is true.
   *
   * @param page the page to get
   * @param throwIfUndefined whether to throw an error if the page info doesn't exist
   */
  public get(page: string, throwIfUndefined: true): PageInfo
  public get(page: string, throwIfUndefined?: boolean): PageInfo | undefined
  public get(page: string, throwIfUndefined?: boolean): PageInfo | undefined {
    const pageInfo = super.get(page)
    if (!pageInfo && throwIfUndefined) {
      throw new Error(`Invariant: Expected page "${page}" to exist`)
    }

    return pageInfo
  }
}
