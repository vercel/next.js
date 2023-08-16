import { invokeNodeAPI } from '../../lib/utils'

export default async function handler(request) {
  invokeNodeAPI(request.nextUrl.searchParams.get('case'))
  return Response.json({ ok: true })
}

export const config = { runtime: 'edge' }
