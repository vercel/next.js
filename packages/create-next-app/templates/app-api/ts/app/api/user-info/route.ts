import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  
  const theme = request.cookies.get('theme')?.value || 'light'
  request.cookies.set('last-visited', new Date().toISOString())

  // use nextUrl
  const { searchParams } = request.nextUrl
  const name = searchParams.get('name') || 'Anonymous'

  
  const ip = request.ip || 'Unknown'

  
  const geo = request.geo || {
    city: 'Unknown',
    country: 'Unknown',
    region: 'Unknown',
    latitude: 'Unknown',
    longitude: 'Unknown',
  }

  const response = {
    message: `Hello, ${name}!`,
    theme,
    ip,
    geo,
  }

  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Set-Cookie': `last-visit=${new Date().toISOString()}; Path=/; HttpOnly`,
    },
  })
}