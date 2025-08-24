// ensure performance is available in edge
console.log(performance.now())

export async function GET() {
  return new Response(JSON.stringify({ test: 'data-edge' }))
}

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
