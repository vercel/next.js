export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteName: string }> }
) {
  const { siteName } = await params
  return new Response(`site=${siteName}`, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
