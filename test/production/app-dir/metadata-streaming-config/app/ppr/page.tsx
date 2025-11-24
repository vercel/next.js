import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <p>ppr</p>
}

export const experimental_ppr = true
