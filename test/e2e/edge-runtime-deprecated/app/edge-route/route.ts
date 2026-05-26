export const runtime = 'edge'

export function GET() {
  return new Response('edge route')
}
