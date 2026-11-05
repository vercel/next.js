export function GET() {
  return new Response('short', {
    headers: { 'content-length': '100' },
  })
}
