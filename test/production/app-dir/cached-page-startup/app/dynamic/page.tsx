import { connection } from 'next/server'
import Link from 'next/link'

export default async function Page() {
  await connection()
  return (
    <>
      <p id="dynamic">Dynamic content</p>
      <Link href="/">Home</Link>
    </>
  )
}
