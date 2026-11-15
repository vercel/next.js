import { revalidateTag } from 'next/cache'

export default function Page() {
  return <p>revalidate-tag</p>
}

export async function generateStaticParams() {
  revalidateTag('data', 'max')
  return [{ slug: 'test' }]
}
