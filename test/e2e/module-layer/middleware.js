import 'server-only'
import React from 'react'
import { NextResponse } from 'next/server'
// import './lib/mixed-lib'

export function middleware(request) {
  if (React.useState) {
    throw new Error('React.useState should not be defined in server layer')
  }
  return NextResponse.next()
}
