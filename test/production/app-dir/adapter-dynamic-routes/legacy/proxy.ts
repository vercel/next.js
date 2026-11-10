import { NextResponse } from 'next/server'

export default function proxy() {
  return NextResponse.next()
}
