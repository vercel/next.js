import { connection } from 'next/server'
import { unstable_cache as cache } from 'next/cache'

export async function GET() {
  await connection()
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

const getCachedRandom = cache(async () => {
  return Math.random()
})
