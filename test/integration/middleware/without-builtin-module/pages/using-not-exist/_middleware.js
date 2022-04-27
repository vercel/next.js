import { NextResponse } from 'next/server'
import NotExist from 'not-exist'

export async function middleware(request) {
  new NotExist()
  return NextResponse.next()
}
