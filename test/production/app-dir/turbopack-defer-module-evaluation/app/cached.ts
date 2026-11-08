export async function cached() {
  'use cache'

  return `cached:${Math.random()}`
}
