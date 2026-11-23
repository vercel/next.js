import type { NextRequest } from 'next/server'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params
  return Response.json({
    name,
    secret: ['private', 'literal.rsc'].includes(name),
  })
}
