// Control: a regular route handler with the same revalidation interval.
export const revalidate = 5

export function GET() {
  return Response.json({ generatedAt: new Date().toISOString() })
}
