import { cookies, headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const before = (await cookies()).get('visitor')?.value
  const { id } = await context.params
  const language = (await headers()).get('accept-language')
  const after = (await cookies()).get('visitor')?.value
  return NextResponse.json({
    before,
    after,
    language,
    id,
    pathname: request.nextUrl.pathname,
    values: request.nextUrl.searchParams.getAll('value'),
  })
}
