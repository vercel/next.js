export const dynamic = 'force-static'

export async function GET(request, context) {
  const { params } = context
  const { slug } = params
  return Response.json({ message: `Hello, ${slug}!` })
}
