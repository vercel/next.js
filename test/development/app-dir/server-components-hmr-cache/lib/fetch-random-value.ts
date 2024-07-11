export async function fetchRandomValue(key: string) {
  const url = new URL('https://next-data-api-endpoint.vercel.app/api/random')
  url.searchParams.set('key', key)
  const res = await fetch(url, { cache: 'no-store' })

  return res.text()
}
