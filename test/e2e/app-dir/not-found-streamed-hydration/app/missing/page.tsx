import { connection } from 'next/server'
import { notFound } from 'next/navigation'

export default async function Page() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 50))
  return notFound()
}
