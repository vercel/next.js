import type { NextRequest } from 'next/server'

import { getSentinelValue } from '../../getSentinelValue'

export async function GET(request: NextRequest) {
  const fetcheda = await fetchRandomCached('a')
  const fetchedb = await fetchRandomCached('b')
  return new Response(
    JSON.stringify({
      value: getSentinelValue(),
      random1: fetcheda,
      random2: fetchedb,
    })
  )
}

const fetchRandomCached = async (entropy: string) => {
  const response = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?b=' + entropy,
    { cache: 'force-cache' }
  )
  return response.text()
}
