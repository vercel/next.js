export function GET() {
  return new Response('Hello from app-route-edge')
}

export const runtime = 'edge'
