// Top-level await makes this an async module.
await Promise.resolve()

export const dynamic = 'force-static'

export async function GET() {
  return Response.json({ ok: true })
}
