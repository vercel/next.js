import {
  NextRequest,
  NextResponse,
  RequestCookie,
  RequestCookies,
  ResponseCookie,
  ResponseCookies,
} from 'next/server'

export const config = {
  runtime: 'experimental-edge',
}

const AsyncApiEndpoint = async (req: NextRequest) => {
  // Test cookies type
  const cookies: RequestCookies = req.cookies

  const res = new NextResponse()

  const resCookies: ResponseCookies = res.cookies

  const cookie: RequestCookie = { name: 'foo', value: 'bar' }

  req.cookies.set(cookie)

  const resCookie: ResponseCookie = { name: 'foo', value: 'bar' }

  res.cookies.set(resCookie)

  return NextResponse.json({
    RequestCookies: cookies instanceof RequestCookies,
    ResponseCookies: resCookies instanceof ResponseCookies,
  })
}

export default AsyncApiEndpoint
