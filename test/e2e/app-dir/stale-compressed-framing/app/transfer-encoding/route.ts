export function GET() {
  return new Response('framed by Node.js', {
    headers: { 'transfer-encoding': 'identity' },
  })
}
