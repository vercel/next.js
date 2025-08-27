import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/docs/[...slug]'>
) {
  const { slug } = await context.params
  return Response.json({ slug })
}
