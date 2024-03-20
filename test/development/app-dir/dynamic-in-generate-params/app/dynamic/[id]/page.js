export default function Page() {
  return 'page'
}

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  await fetch('https://example.com')

  return [{ id: '0' }, { id: '1' }]
}
