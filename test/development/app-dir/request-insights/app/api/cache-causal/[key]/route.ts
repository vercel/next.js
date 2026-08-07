import { headers } from 'next/headers'

export async function GET() {
  const cookie = (await headers()).get('cookie')
  const causalCookieVisible =
    cookie
      ?.split(';')
      .some((part) =>
        part.trim().startsWith('__next_request_insights_causal=')
      ) ?? false

  return Response.json({ causalCookieVisible })
}
