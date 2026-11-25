import { connection } from 'next/server'

export default async function Side({
  searchParams,
}: {
  searchParams: Promise<{ value?: string }>
}) {
  await connection()
  const { value } = await searchParams
  return (
    <>
      <p id="retained-value">{value}</p>
      <p id="retained-render">{crypto.randomUUID()}</p>
    </>
  )
}
