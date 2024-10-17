import { cookies } from 'next/headers'
import { getRequestMeta, withRequestMeta } from '../../../helpers'

export async function GET() {
  const c = await cookies()

  // Put the request meta in the response directly as meta again.
  const meta = getRequestMeta(c)

  return new Response(null, {
    status: 200,
    headers: withRequestMeta(meta),
  })
}
