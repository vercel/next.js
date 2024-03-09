export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export function GET() {
  return new Response('Hello from /app/two/example/route.ts')
}
