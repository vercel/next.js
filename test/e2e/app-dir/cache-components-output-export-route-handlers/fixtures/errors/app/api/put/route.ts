export function GET() {
  return Response.json({ message: 'GET alongside PUT' })
}

export function PUT() {
  return new Response('Unsupported PUT')
}
