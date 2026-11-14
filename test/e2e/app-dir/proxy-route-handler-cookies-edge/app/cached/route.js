export const revalidate = 1

export async function GET() {
  return Response.json({ time: Date.now() })
}
