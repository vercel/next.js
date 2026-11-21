// Route handler workload: parse a JSON request body and echo it back.
export async function POST(request) {
  const body = await request.json()
  return Response.json({
    received: body,
    keys: Object.keys(body).length,
  })
}
