export function GET() {
  return Response.json({ value: process.env.HANDOFF_VALUE ?? null })
}
