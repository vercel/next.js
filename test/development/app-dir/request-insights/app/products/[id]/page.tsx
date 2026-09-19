import { headers } from 'next/headers'
import { connection } from 'next/server'

export const instant = false

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()
  const { id } = await params
  const host = (await headers()).get('host')
  if (!host) {
    throw new Error('Missing request host')
  }

  await fetch(`http://${host}/api/source?token=Q2_SECRET_SENTINEL`, {
    cache: 'no-store',
  })

  return <p id="product-id">{id}</p>
}
