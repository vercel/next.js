import { cookies } from 'next/headers'
import { projects } from '../../../lib/data'

// Route handler workload: a dynamic segment plus the request reads most
// handlers do before touching data (search params, a header, a cookie).
// The response echoes every input, so a cached or prerendered response
// cannot pass for a fresh one.
export async function GET(request, { params }) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams
  const limit = Number(searchParams.get('limit') ?? '10')
  const fields = searchParams.get('fields')?.split(',') ?? null
  const authorization = request.headers.get('authorization')
  const cookieStore = await cookies()
  const session = cookieStore.get('session')?.value ?? null

  const project = projects[Number(id) % projects.length]

  return Response.json({
    id,
    limit,
    fields,
    authorized: authorization?.startsWith('Bearer ') ?? false,
    session,
    project,
  })
}
