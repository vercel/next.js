export async function fetchRandomValue(param: string) {
  const url = new URL('https://next-data-api-endpoint.vercel.app/api/random')
  url.searchParams.set('param', param)
  const res = await fetch(url, { cache: 'no-store' })

  return res.text()
}
