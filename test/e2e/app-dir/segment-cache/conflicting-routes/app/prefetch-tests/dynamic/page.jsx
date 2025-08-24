import { connection } from 'next/server'

export default async function Page() {
  await connection()

  return <div>/prefetch-tests/dynamic</div>
}
