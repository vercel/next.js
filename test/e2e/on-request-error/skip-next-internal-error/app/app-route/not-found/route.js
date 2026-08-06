import { connection } from 'next/server'
import { notFound } from 'next/navigation'

export async function GET() {
  await connection()
  notFound()
}
