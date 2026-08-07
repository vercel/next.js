import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getRequestSnapshot(request: Request, id: string) {
  const url = new URL(request.url)
  return {
    id,
    pathname: url.pathname,
    client: url.searchParams.get('client'),
    from: url.searchParams.get('from'),
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const snapshot = getRequestSnapshot(request, id)

  if (request.headers.get('upgrade') !== 'websocket') {
    return Response.json(snapshot)
  }

  return NextResponse.upgrade({
    open(peer) {
      peer.send(JSON.stringify(snapshot))
    },
  })
}
