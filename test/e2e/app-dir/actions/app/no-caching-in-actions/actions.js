'use server'

export async function getNumber() {
  const res = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?no-caching-actions'
  )

  return res.text()
}
