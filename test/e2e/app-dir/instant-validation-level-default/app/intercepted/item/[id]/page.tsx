import { connection } from 'next/server'

export const instant = false

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()
  const { id } = await params
  return <h1 id="item-page">Item {id} (full page)</h1>
}
