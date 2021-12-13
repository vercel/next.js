import { NextRequest } from 'next/server'

export default function middleware() {
  return NextRequest.next()
}
