export function GET() {
  return Response.json({ message: 'GET alongside HEAD' })
}

export function HEAD() {
  return new Response('Unsupported HEAD')
}
