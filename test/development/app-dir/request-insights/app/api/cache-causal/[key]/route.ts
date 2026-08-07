const CAUSAL_COOKIE = '__next_request_insights_causal='

export async function GET(request: Request) {
  const causalCookieVisible = (request.headers.get('cookie') ?? '')
    .split(';')
    .some((cookie) => cookie.trim().startsWith(CAUSAL_COOKIE))

  return Response.json({ causalCookieVisible })
}
