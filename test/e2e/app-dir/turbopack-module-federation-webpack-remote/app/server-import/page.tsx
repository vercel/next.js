import { connection } from 'next/server'

export default async function ServerImportPage() {
  await connection()
  // @ts-expect-error -- intentionally verifies the server-only diagnostic
  const remote = await import('catalog/message')
  return <p>{remote.message}</p>
}
