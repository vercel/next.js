// Keep this module asynchronous so tracing covers promise-backed userland loads.
await Promise.resolve()

export async function GET() {
  return new Response(JSON.stringify({ test: 'data' }))
}

export const dynamic = 'force-dynamic'
