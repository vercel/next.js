export function GET() {
  return new Response('{ "name": "metadata-app" }', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
