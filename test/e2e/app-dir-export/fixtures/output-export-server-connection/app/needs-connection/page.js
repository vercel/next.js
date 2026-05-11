import { connection } from 'next/server'

export default async function ConnectionPage() {
  await connection()

  return <h1>connected</h1>
}
