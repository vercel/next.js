export function GET() {
  return new Response('app-route (edge)')
}

export const runtime = 'edge'
