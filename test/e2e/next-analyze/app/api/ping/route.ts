export async function GET() {
  const { platform } = await import('node:os')
  return Response.json({ ok: true, platform: platform() })
}
