// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'edge',
}

export default function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return new Response(
    JSON.stringify({ hello: 'world', input: searchParams.get('input') }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }
  )
}
