export default async function handler(request) {
  return Response.json({ ok: true })
}

export const config = { runtime: 'edge' }
