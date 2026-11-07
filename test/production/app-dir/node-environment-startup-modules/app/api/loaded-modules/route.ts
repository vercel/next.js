import Module from 'node:module'

export const dynamic = 'force-dynamic'

// Reports which `next/dist` files the server process has loaded so far.
export function GET() {
  const loaded = Object.keys(
    (Module as unknown as { _cache: Record<string, unknown> })._cache
  )
    .map((id) => id.replace(/\\/g, '/'))
    .filter((id) => id.includes('/next/dist/'))
    .map((id) => id.slice(id.lastIndexOf('/next/dist/') + 1))
    .sort()

  return Response.json(loaded)
}
