import { headers } from 'next/headers'

export default function Page() {
  return <p>headers</p>
}

export async function generateStaticParams() {
  await headers()
  return [{ slug: 'test' }]
}
