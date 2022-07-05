import { NextResponse } from 'next/server'
import { invokeNodeAPI } from './lib/utils'

export default function middleware({ nextUrl: { pathname } }) {
  invokeNodeAPI(pathname.slice(1))
  return NextResponse.next()
}
