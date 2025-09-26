import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <p>suspenseful - dynamic</p>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1 * 1000))
  return {
    title: 'suspenseful page - dynamic',
  }
}
