import { connection } from 'next/server'

export default function Page() {
  return <p>connection</p>
}

export async function generateStaticParams() {
  await connection()
  return [{ slug: 'test' }]
}
