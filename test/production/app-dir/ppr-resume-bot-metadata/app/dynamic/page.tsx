import { cookies } from 'next/headers'
import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()

  return {
    title: 'dynamic-metadata-title',
  }
}

export default async function Page() {
  const store = await cookies()

  return <p id="content">dynamic content {store.size}</p>
}
