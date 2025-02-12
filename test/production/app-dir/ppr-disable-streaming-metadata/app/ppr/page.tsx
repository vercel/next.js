import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <p>ppr</p>
}

export async function generateMetadata() {
  await connection()
  return { title: 'ppr-title' }
}

export const experimental_ppr = true
