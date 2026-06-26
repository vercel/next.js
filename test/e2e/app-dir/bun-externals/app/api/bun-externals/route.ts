import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, string> = {}

  const modules = [
    { name: 'bunFfi', module: 'bun:ffi' },
    { name: 'bunJsc', module: 'bun:jsc' },
    { name: 'bunSqlite', module: 'bun:sqlite' },
    { name: 'bunTest', module: 'bun:test' },
    { name: 'bunWrap', module: 'bun:wrap' },
    { name: 'bun', module: 'bun' },
  ]

  for (const { name, module } of modules) {
    try {
      require(module)
      results[name] = 'loaded'
    } catch (e: any) {
      // Expected: Cannot find module error when not in Bun runtime
      // This confirms the module was externalized (not bundled)
      results[name] = e.message.includes('Cannot find module')
        ? 'external'
        : 'error'
    }
  }

  return NextResponse.json(results)
}
