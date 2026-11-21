await Promise.resolve()

export function GET() {
  return Response.json({ message: 'Async module with an unsupported method' })
}

export function POST() {
  return new Response('Unsupported method')
}
