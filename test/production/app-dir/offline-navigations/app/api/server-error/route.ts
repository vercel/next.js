export function GET() {
  return new Response('offline navigation server error', {
    status: 500,
  })
}

export function POST() {
  return new Response('offline navigation post response')
}
