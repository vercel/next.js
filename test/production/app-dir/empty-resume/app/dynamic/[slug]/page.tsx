import { connection } from 'next/server'

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await connection()
  const { slug } = await params

  return <p id="slug">{slug}</p>
}
