import { connection } from 'next/server'

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  // Force a dynamic hole so the route postpones and is served via the
  // minimal-mode resume path (the static shell is the Suspense fallback).
  await connection()
  const { slug } = await params

  return <p id="slug">{slug}</p>
}
