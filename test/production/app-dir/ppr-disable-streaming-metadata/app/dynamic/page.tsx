import { connection } from 'next/server'

export default async function Page() {
  return <p>hello world</p>
}

// Dynamic metadata
export async function generateMetadata() {
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return { title: 'dynamic-title' }
}
