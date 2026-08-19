export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string }> }
) {
  return Response.json({ lang: (await params).lang })
}
