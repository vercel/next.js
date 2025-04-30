async function getCachedRandom() {
  'use cache'
  return Math.random()
}

export async function GET() {
  const [rand1, rand2] = await Promise.all([
    getCachedRandom(),
    getCachedRandom(),
  ])

  const response = JSON.stringify({ rand1, rand2 })

  return new Response(response, {
    headers: { 'content-type': 'application/json' },
  })
}
