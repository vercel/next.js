import { connection } from 'next/server'
import { notFound } from 'next/navigation'

export default function Page() {
  return <p>boundary notfound page</p>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  notFound()
}

export const dynamic = 'force-dynamic'
