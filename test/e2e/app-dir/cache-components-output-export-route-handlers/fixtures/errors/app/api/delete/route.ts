export function GET() {
  return Response.json({ message: 'GET alongside DELETE' })
}

export function DELETE() {
  return new Response('Unsupported DELETE')
}
