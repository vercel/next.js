import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return { title: 'dynamic-title' }
}

export default function Page() {
  return <p>static body</p>
}
