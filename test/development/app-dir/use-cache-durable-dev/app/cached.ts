export async function getCachedValue() {
  'use cache'

  return `cached-v1:${Math.random()}`
}
