import { NextResponse } from 'next/server'

export const runtime = 'edge'

// Edge runtime should not allow Bun imports
// This test verifies that Bun modules are handled correctly in edge runtime
export async function GET() {
  const modules = [
    { name: 'bunFfi', module: 'bun:ffi' },
    { name: 'bunJsc', module: 'bun:jsc' },
    { name: 'bunSqlite', module: 'bun:sqlite' },
    { name: 'bunTest', module: 'bun:test' },
    { name: 'bunWrap', module: 'bun:wrap' },
    { name: 'bun', module: 'bun' },
  ]

  try {
    for (const { module } of modules) {
      await import(module)
    }

    return NextResponse.json('Did not throw')
  } catch (e) {
    return NextResponse.json(String(e))
  }
}
