import { connection } from 'next/server'

export const instant = { level: 'experimental-error' }

export default async function Slot2aPage() {
  await connection()
  return <p>Slot 2a — blocks with connection()</p>
}
