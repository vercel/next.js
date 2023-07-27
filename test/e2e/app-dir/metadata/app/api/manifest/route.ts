export function GET() {
  return new Response('{ "name": "metadata-app", }', {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}
