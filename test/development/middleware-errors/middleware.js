import { NextResponse } from 'next/server'
export default function () {
  eval('test')
  return NextResponse.next()
}
