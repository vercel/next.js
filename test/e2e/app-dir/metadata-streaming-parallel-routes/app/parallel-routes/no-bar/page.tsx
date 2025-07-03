import Link from 'next/link'
import { connection } from 'next/server'

export default function Page() {
  return (
    <div>
      <p>no bar</p>
      <Link href="/parallel-routes">Back to /parallel-routes</Link>
    </div>
  )
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return {
    title: `Dynamic api ${Math.random()}`,
    description: 'no-bar description',
  }
}
