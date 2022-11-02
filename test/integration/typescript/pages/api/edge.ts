import { NextRequest, RequestCookies } from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

const AsyncApiEndpoint = async (req: NextRequest) => {
  // Test cookies type
  const cookies: RequestCookies = req.cookies

  return new Response(cookies instanceof RequestCookies ? 'ok' : 'error')
}

export default AsyncApiEndpoint
