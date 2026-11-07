import Module from 'node:module'
import { connection } from 'next/server'

// Reports whether `register()` of the instrumentation file ran, and which
// `next/dist` files the server process has loaded so far.
export async function GET() {
  // Opt out of prerendering: the answer must come from the running server.
  await connection()

  const loaded = Object.keys(
    (Module as unknown as { _cache: Record<string, unknown> })._cache
  )
    .map((id) => id.replace(/\\/g, '/'))
    .filter((id) => id.includes('/next/dist/'))
    .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1))
    .sort()

  return Response.json({
    registered: (globalThis as any).instrumentationRegistered === true,
    loaded,
  })
}
