import { NextResponse } from 'next/server'

export default function () {
  const response = NextResponse.next()
  response.cookies.set('common-cookie', 'from-middleware')
  return response
}
