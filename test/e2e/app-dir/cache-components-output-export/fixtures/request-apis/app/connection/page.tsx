import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <p>{Math.random()}</p>
}
