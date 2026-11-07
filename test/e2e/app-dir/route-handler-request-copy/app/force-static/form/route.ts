import type { NextRequest } from 'next/server'

export const dynamic = 'force-static'

export async function POST(request: NextRequest) {
  const formData = await request.formData()

  return Response.json({
    field: formData.get('field'),
    header: request.headers.get('content-type'),
  })
}
