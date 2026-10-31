export const runtime = 'edge'
export const preferredRegion = ['cdg1']
export const dynamic = 'force-dynamic'

export function GET(_request: Request) {
  return new Response('Hello, world!', { status: 200 })
}
