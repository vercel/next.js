export async function GET() {
  return Response.json({ value: 'data' })
}

export async function POST(request: Request) {
  return Response.json({ received: await request.json() })
}
