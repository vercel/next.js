import { connection } from 'next/server'

export default async function Page() {
  await connection()

  return <div>/prefetch-tests/[id]</div>
}

export const experimental_ppr = true
