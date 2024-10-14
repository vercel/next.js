async function getCachedRandom() {
  'use cache'
  return Math.random()
}

export async function GET() {
  const rand1 = await getCachedRandom()
  // TODO: Remove this extra micro task when bug in use cache wrapper is fixed.
  await Promise.resolve()
  const rand2 = await getCachedRandom()

  const response = JSON.stringify({ rand1, rand2 })

  return new Response(response, {
    headers: { 'content-type': 'application/json' },
  })
}
