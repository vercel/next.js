import { connection } from 'next/server'
export default async function Page() {
  await connection()
  return <p id="result">calculator</p>
}
