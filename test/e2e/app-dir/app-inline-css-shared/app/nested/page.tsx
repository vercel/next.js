import { connection } from 'next/server'

export default async function NestedPage() {
  await connection()
  return (
    <main id="page-nested" className="p-4">
      <h1 className="text-2xl font-bold text-blue-500">Nested Page</h1>
      <p>This page is inside a nested layout</p>
    </main>
  )
}
