export function generateStaticParams() {
  return []
}

export const revalidate = 120

export async function GET() {
  return new Response(JSON.stringify({ test: 'data' }), { status: 201 })
}
