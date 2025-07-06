export default function Page() {
  return 'page'
}

export const dynamic = 'force-static'

export async function generateStaticParams() {
  return [{ id: '0' }, { id: '1' }]
}
