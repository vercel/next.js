import { connection } from 'next/server'

export default async function TestPage() {
  // Use connection() instead of force-dynamic for Cache Components compatibility
  await connection()
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return <div>Welcome to Foo Page</div>
}
