export const dynamic = 'auto'

export async function GET() {
  return new Response(dynamic)
}
