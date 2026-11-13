export function GET() {
  return Response.json({ message: 'GET alongside OPTIONS' })
}

export function OPTIONS() {
  return new Response('Unsupported OPTIONS')
}
