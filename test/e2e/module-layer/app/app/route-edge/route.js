import 'server-only'

export function GET() {
  return new Response('app-route-edge/route.js')
}

export const runtime = 'edge'
