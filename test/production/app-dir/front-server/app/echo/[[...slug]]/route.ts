import { createHash } from 'node:crypto'

// Returns what the route received: the URL, the params and every header, plus
// the length and hash of the body.
async function echo(
  request: Request,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? null
      : Buffer.from(await request.arrayBuffer())

  return Response.json({
    method: request.method,
    url: request.url,
    slug: (await params).slug ?? null,
    headers: Object.fromEntries(request.headers),
    body: body && {
      length: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
    },
  })
}

export const GET = echo
export const POST = echo
