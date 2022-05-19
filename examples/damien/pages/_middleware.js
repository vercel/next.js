import { NextResponse } from 'next/server'

export default async function middleware(req) {
  console.log('body:', await req.json())
  console.log('-------')
  return NextResponse.next()
}
