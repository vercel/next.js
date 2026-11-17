export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  return Response.json({ route: `app index data route ${slug}` })
}
