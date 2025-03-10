export async function fetchCached(url: string) {
  const response = await fetch(url, { cache: 'force-cache' })
  return response.text()
}

export async function getCachedData(_key: string) {
  'use cache'
  await new Promise((r) => setTimeout(r))
  return Math.random()
}
