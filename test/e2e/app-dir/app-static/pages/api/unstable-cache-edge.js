import { unstable_cache } from 'next/cache'

export const config = {
  runtime: 'edge',
}

export default async function handler(req) {
  const data = await unstable_cache(async () => {
    return {
      random: Math.random(),
    }
  })()

  return new Response(
    JSON.stringify({
      now: Date.now(),
      data,
    }),
    {
      headers: {
        'content-type': 'application/json',
      },
    }
  )
}
