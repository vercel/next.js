export function generateStaticParams() {
  return []
}

export async function GET() {
  return new Response(JSON.stringify({ test: 'data' }), { status: 201 })
}

export const revalidate = 120
