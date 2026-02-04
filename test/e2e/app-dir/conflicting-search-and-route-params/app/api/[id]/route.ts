import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: routeId } = await params
  const searchId = request.nextUrl.searchParams.get('id')

  return Response.json({
    routeParam: routeId,
    searchParam: searchId,
  })
}
