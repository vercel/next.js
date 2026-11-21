export type CacheEntryKind = 'redirect' | 'value'
export type OperationStatus = 'started' | 'completed' | 'rejected'

export interface CacheGetOperation {
  type: 'get'
  cacheKey: string
}

export interface CacheGetResponseOperation {
  type: 'get-response'
  cacheKey: string
}

export interface CacheSetOperation {
  type: 'set'
  cacheKey: string
  tags: string[]
  entry: CacheEntryKind
}

export interface CacheGenerationOperation {
  type: 'generate'
  language: string
}

export type CacheOperation =
  | CacheGetOperation
  | CacheGetResponseOperation
  | CacheSetOperation
  | CacheGenerationOperation

export interface CacheGetMatcher {
  type: 'get'
  cacheKey?: string
}

export interface CacheGetResponseMatcher {
  type: 'get-response'
  cacheKey?: string
}

export interface CacheSetMatcher {
  type: 'set'
  tag?: string
  entry?: CacheEntryKind
}

export interface CacheGenerationMatcher {
  type: 'generate'
  language?: string
}

export type CacheOperationMatcher =
  | CacheGetMatcher
  | CacheGetResponseMatcher
  | CacheSetMatcher
  | CacheGenerationMatcher

export interface CacheOperationRecord {
  operation: CacheOperation
  status: OperationStatus
  ruleId?: string
}

export interface CacheControlRule {
  id: string
  match: CacheOperationMatcher
  action: 'hold' | 'reject' | 'observe'
}

export interface RegisteredCacheControlRule {
  rule: CacheControlRule
  used: boolean
  pending: Promise<void>
  release: () => void
}

export interface CacheControlOptions {
  keyIncludes: string[]
  backend?: 'default' | 'retain-stale'
  cacheLife?: {
    stale: number
    revalidate: number
    expire: number
  }
}
