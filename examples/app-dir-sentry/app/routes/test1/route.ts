import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

/**
 * Use `Sentry.captureException` on app dir route handlers until
 * first class support for app dir route handlers is provided by sentry
 */

export async function GET() {
  try {
    throw new Error('API Test 4')
  } catch (error) {
    Sentry.captureException(error)
  }

  return NextResponse.json({ data: 'Testing...' })
}
