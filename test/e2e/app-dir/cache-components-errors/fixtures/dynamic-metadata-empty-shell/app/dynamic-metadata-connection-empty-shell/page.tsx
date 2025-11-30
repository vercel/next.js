import { connection } from 'next/server'

export async function generateMetadata() {
  await connection()
  return { title: 'Dynamic Metadata with connection' }
}

export default async function Page() {
  return (
    <>
      <p>
        This page uses connection() in generateMetadata which should produce a
        specific error.
      </p>
      <span id="sentinel">sentinel</span>
    </>
  )
}
