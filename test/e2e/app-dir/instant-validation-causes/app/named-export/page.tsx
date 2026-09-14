import { connection } from 'next/server'

const instant = true
export { instant }

export default async function Page() {
  await connection()
  return <p>named export</p>
}
