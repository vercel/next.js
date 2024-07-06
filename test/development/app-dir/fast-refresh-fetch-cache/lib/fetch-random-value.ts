export async function fetchRandomValue() {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    { cache: 'no-store' }
  )

  return res.text()
}
