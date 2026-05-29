import { getRequestMeta, withRequestMeta } from '../../../../helpers'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  // Put the request meta in the response directly as meta again.
  const meta = getRequestMeta(req.cookies)

  return new Response(null, {
    status: 200,
    headers: withRequestMeta(meta),
  })
}
