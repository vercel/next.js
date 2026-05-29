import { NextResponse } from 'next/server'
import * as bind from 'function-bind'
console.log(bind)
export default async function middleware(request) {
  return NextResponse.next()
}
