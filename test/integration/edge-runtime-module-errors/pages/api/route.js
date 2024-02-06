import { basename } from 'path'

export default async function handler(request) {
  basename()
  return Response.json({ ok: basename() })
}

export const config = { runtime: 'edge' }
