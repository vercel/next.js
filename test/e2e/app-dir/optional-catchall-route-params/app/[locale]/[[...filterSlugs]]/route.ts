export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; filterSlugs?: string[] }> }
) {
  return Response.json(await params)
}
