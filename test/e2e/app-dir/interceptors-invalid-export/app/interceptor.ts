import { NextRequest } from 'next/server'

// Should be a default export instead.
export async function intercept(request: NextRequest): Promise<void> {
  console.log('URL:', request.url)
}
