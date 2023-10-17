export function GET() {
  return new Response('console.log("hello from preload")', {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
    },
  })
}
