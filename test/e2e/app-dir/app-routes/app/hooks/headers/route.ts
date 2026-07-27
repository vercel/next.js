import { headers } from 'next/headers'
import { getRequestMeta, withRequestMeta } from '../../../helpers'

export async function GET() {
  const h = await headers()

  // Put the request meta in the response directly as meta again.
  const meta = getRequestMeta(h)

  return new Response(null, {
    status: 200,
    headers: withRequestMeta(meta),
  })
}
