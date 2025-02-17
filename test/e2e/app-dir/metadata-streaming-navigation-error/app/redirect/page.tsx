import { connection } from "next/server"
import { redirect } from "next/navigation"

export default function Page() {
  return <p>redirect</p>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 3 * 1000))
  redirect('/')
}

export const dynamic = 'force-dynamic'
