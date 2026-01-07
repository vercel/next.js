import { NextResponse } from 'next/server'

const proxy = 'existing proxy variable'

function middleware() {
  return NextResponse.next()
}

export { middleware as randomName }