import { connection } from 'next/server'

export const instant = false

export default async function Page() {
  await connection()
  return <p>ppr</p>
}
