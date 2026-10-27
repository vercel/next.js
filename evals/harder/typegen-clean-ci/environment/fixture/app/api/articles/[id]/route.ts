export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/articles/[id]'>
) {
  const { id } = await params
  return Response.json({ id })
}
