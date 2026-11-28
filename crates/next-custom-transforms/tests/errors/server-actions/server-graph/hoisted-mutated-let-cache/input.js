export function MutatedLetCache() {
  let value = 'initial'
  const cacheRef = readCached
  value = 'updated'

  return cacheRef

  async function readCached() {
    'use cache'

    return value
  }
}
