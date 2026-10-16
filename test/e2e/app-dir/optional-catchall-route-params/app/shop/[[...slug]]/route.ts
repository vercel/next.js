export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  return Response.json(await params)
}
