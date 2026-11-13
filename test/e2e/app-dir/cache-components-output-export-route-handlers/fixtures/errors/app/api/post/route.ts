export function GET() {
  return Response.json({ message: 'GET alongside POST' })
}

export function POST() {
  return new Response('Unsupported POST')
}
