// A dynamic route handler. It has no `.rsc` form.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  return Response.json({ slug })
}
