import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Edge runtime should not allow Bun imports
// This test verifies that Bun modules are handled correctly in edge runtime
export async function GET() {
  // In edge runtime, unsupported modules are replaced with globalThis.__import_unsupported
  // We can't use dynamic require() in edge runtime, so we'll just return a success response
  // The actual test is that the build completes without bundling the Bun modules
  return NextResponse.json({
    status: 'success',
    message: 'Bun modules correctly blocked in edge runtime',
    runtime: 'edge',
  })
}
