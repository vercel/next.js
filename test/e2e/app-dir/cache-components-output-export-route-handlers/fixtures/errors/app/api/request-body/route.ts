export async function GET(request: Request) {
  return Response.json({ body: await request.text() })
}
