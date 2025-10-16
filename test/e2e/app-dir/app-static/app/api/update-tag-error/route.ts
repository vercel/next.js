import { NextResponse } from 'next/server'
import { updateTag } from 'next/cache'

export async function GET() {
  try {
    // This should throw an error - updateTag cannot be used in route handlers
    updateTag('test-tag')
    return NextResponse.json({ error: 'Should not reach here' })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          (error &&
            typeof error === 'object' &&
            'message' in error &&
            error.message) ||
          'unknown error',
        expectedError: true,
      },
      { status: 500 }
    )
  }
}
