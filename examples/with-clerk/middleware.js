import { withClerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export default withClerkMiddleware((_req) => {
  return NextResponse.next()
})

export const config = {
  matcher: ['/api/getAuthenticatedUserId'],
}
