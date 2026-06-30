import { connection } from 'next/server'

export const instant = { level: 'experimental-error' }

export default async function Slot2bPage() {
  await connection()
  return <p>Slot 2b — blocks with connection()</p>
}
