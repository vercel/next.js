import { connection } from 'next/server'

export default async function Page() {
  await connection()
  // Simulate async work before throwing
  await new Promise((resolve) => setTimeout(resolve, 100))
  throw new Error('Error inside Suspense boundary')
}
