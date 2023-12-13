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
