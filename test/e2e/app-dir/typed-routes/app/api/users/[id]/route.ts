import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/users/[id]'>
) {
  const { id } = await context.params
  return Response.json({ id })
}

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/users/[id]'>
) {
  const { id } = await context.params
  const body = await request.json()
  return Response.json({ id, ...body })
}
