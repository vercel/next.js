import { NextResponse } from 'next/server'

// populated with tests
export default () => {
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
