const CAUSAL_COOKIE = '__next_request_insights_causal='

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> }
) {
  const { source } = await params
  const causalCookieVisible = (request.headers.get('cookie') ?? '')
    .split(';')
    .some((cookie) => cookie.trim().startsWith(CAUSAL_COOKIE))

  return Response.json({ causalCookieVisible, source })
}
