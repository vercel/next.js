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

export type PageInfos = Map<string, PageInfo>

export type SerializedPageInfos = [string, PageInfo][]

export function serializePageInfos(input: PageInfos): SerializedPageInfos {
  return Array.from(input.entries())
}

export function deserializePageInfos(input: SerializedPageInfos): PageInfos {
  return new Map(input)
}
