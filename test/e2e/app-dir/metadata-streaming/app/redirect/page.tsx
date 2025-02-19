import { connection } from 'next/server'
import { redirect } from 'next/navigation'

export default function Page() {
  return <p>redirect page</p>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 2 * 1000))
  redirect('/')
}

export const dynamic = 'force-dynamic'
