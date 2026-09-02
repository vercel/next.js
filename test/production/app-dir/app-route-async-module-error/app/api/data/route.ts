await Promise.reject(new Error('Kaboom'))

export async function GET() {
  return Response.json({ ok: true })
}
