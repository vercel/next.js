import { notFound } from 'next/navigation'
import { connection } from 'next/server'

export default async function Page(): Promise<never> {
  await connection()
  notFound()
}
