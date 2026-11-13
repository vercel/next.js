async function getValue() {
  'use cache: remote'
  return Math.random()
}

export async function GET() {
  return Response.json({ value: await getValue() })
}
