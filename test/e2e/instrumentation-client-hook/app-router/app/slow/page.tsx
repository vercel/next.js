import { connection } from 'next/server'

export default async function Page() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <h1 id="slow-page">Slow page</h1>
}
