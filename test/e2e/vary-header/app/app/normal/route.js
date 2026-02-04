import { NextResponse } from 'next/server'

export async function GET(request) {
  const userAgent = request.headers.get('user-agent')
  const response = NextResponse.json({ message: `Hello, ${userAgent}!` })

  response.headers.set('Cache-Control', 's-maxage=3600')
  response.headers.append('vary', 'User-Agent')

  return response
}
