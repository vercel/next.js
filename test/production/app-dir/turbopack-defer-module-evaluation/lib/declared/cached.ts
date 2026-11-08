export async function declaredCached() {
  'use cache'

  return `declared-cached:${Math.random()}`
}
