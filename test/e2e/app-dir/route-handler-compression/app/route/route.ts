export const dynamic = 'force-dynamic'

export function GET() {
  return new Response('route-handler-content'.repeat(200), {
    headers: {
      'content-type': 'text/plain',
      vary: 'custom',
    },
  })
}
