import { NextResponse } from 'next/server'

export function GET() {
  const response = new NextResponse()
  response.cookies.set({
    name: 'example',
    value: 'example',
  })

  return response
}
