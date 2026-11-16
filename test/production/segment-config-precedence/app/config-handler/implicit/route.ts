export function GET() {
  return Response.json({ runtime: process.env.NEXT_RUNTIME })
}
