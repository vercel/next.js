import { connection } from 'next/server'

export default async function Page() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 500))
  return <p>suspenseful - dynamic</p>
}

export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 200))
  return {
    title: 'suspenseful page - dynamic',
  }
}
