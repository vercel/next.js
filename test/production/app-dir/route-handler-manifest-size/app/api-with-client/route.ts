import { NextResponse } from 'next/server'
// Direct import from a 'use client' module
// The import creates a client reference in the manifest
import { formatData } from './client-utils'

export async function GET() {
  // Note: formatData is a client reference here, not the actual function
  // This tests that direct client imports appear in the route's manifest
  return NextResponse.json({
    message: 'Hello from route handler with client import',
    // We can't actually call formatData here since it's a client reference
    hasClientImport: typeof formatData !== 'undefined',
  })
}
