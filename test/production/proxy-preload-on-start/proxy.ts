import { NextResponse } from 'next/server'

console.log('proxy:module-evaluated')

export function proxy() {
  return NextResponse.next()
}
