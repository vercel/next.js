import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return { title: 'Dynamic title' }
}

export default function Page() {
  return <p>Static body with dynamic metadata</p>
}
