import { notFound } from 'next/navigation'

async function missing() {
  'use cache'
  return true
}

export default async function Page() {
  if (await missing()) notFound()
  return <p>Unreachable content</p>
}
