export function GET() {
  return new Response('force-dynamic')
}

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  await fetch('https://example.com')

  return [{ id: '0' }, { id: '1' }]
}
