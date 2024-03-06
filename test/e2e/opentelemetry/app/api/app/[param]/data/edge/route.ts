export async function GET() {
  // ensure performance is available in edge
  console.log(performance.now())

  return new Response(JSON.stringify({ test: 'data-edge' }))
}

export const runtime = 'edge'
export const dynamic = 'force-dynamic'
