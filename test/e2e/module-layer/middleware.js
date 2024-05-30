import 'server-only'
import * as React from 'react'
import { NextResponse } from 'next/server'
// import './lib/mixed-lib'

export function middleware(request) {
  // To avoid webpack ESM exports checking warning
  const ReactObject = Object(React)
  if (ReactObject.useState) {
    throw new Error('React.useState should not be defined in server layer')
  }

  if (request.nextUrl.pathname === '/middleware') {
    return Response.json({
      React: Object.keys(ReactObject),
    })
  }

  return NextResponse.next()
}
