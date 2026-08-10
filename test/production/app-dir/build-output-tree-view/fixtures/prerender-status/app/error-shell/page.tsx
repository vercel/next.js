import { notFound } from 'next/navigation'
import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return { title: 'Runtime metadata' }
}

export default function ErrorShellPage() {
  return notFound()
}
