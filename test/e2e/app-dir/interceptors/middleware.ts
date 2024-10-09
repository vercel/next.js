import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  if (request.method === 'POST') {
    if (request.headers.get('content-type').startsWith('multipart/form-data')) {
      // Consume the request body to ensure this doesn't break when also
      // consumed in an interceptor or the action handler. We're not logging it
      // though for CLI output assertions, because it only contains internal
      // React server action form fields.
      await request.formData()
    } else {
      console.log('MIDDLEWARE', await request.text())
    }
  }

  return NextResponse.next()
}
