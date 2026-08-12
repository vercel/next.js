export async function POST(request: Request) {
  await request.arrayBuffer()

  return new Response(null, {
    status: 500,
    headers: {
      'content-type': 'text/plain',
    },
  })
}
