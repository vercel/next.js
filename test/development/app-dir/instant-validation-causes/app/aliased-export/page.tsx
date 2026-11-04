import { connection } from 'next/server'

const instantConfig = true
export { instantConfig as instant }

export default async function Page() {
  await connection()
  return <p>aliased export</p>
}
