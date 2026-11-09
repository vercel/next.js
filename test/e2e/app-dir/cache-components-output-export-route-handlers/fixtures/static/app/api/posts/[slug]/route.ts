export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params
  return Response.json({ slug })
}
