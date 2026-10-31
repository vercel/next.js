import { cookies } from 'next/headers'

export default function Page() {
  return <p>cookies</p>
}

export async function generateStaticParams() {
  await cookies()
  return [{ slug: 'test' }]
}
