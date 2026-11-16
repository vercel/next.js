export function GET() {
  return Response.json({ message: 'GET alongside PATCH' })
}

export function PATCH() {
  return new Response('Unsupported PATCH')
}
