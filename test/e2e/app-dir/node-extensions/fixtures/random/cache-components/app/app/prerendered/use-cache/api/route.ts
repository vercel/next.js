export async function GET() {
  const response = JSON.stringify({
    rand1: await getCachedRandom(),
    rand2: await getCachedRandom(),
  })
  return new Response(response, {
    headers: {
      'content-type': 'application/json',
    },
  })
}

async function getCachedRandom() {
  'use cache'
  return Math.random()
}
