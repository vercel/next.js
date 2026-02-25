import { connection } from 'next/server'

export const unstable_staleTime = { dynamic: 300 } // 5 minutes

export default async function Page() {
  await connection()
  return <div>Page with unstable_staleTime dynamic=300 (5 minutes)</div>
}
