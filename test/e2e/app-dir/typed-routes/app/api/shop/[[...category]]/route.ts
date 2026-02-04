import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/shop/[[...category]]'>
) {
  const { category } = await context.params
  return Response.json({ category })
}
