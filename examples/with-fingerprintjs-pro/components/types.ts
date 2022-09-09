export type CacheStrategyPath =
  | 'no-cache'
  | 'memory-cache'
  | 'session-storage-cache'
  | 'ls-cache'

export type RouterProps = {
  cacheStrategy: CacheStrategyPath
}
