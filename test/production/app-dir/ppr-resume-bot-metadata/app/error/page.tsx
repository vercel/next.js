import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()

  return {
    title: 'error-metadata-title',
  }
}

export default async function Page() {
  await cookies()
  return notFound()
}
