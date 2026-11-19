import { connection } from 'next/server'

export const instant = false

export default async function PlainPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await connection()
  const { id } = await params
  return <h1 id="plain-page">Plain {id}</h1>
}
