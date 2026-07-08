import { connection } from 'next/server'

const _instant = true
const instantConfig = _instant
export { instantConfig as instant }

export default async function Page() {
  await connection()
  return <p>indirect export</p>
}
