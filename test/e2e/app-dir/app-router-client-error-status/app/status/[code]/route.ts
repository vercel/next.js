export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  return new Response('explicit status', { status: Number(code) })
}
