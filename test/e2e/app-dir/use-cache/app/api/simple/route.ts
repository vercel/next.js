async function getCachedRandom() {
  'use cache'

  return Math.random()
}

export async function GET() {
  return Response.json({ rand: await getCachedRandom() })
}
