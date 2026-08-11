import { connection } from 'next/server'

export default async function DynamicPage() {
  if (!process.env.NEXT_TEST_OUTPUT_EXPORT) {
    await connection()
  }

  return <p>dynamic page</p>
}
