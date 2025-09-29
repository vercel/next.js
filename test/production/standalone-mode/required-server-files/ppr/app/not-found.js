import { connection } from 'next/server'

export default async function NotFound() {
  await connection()

  return (
    <>
      <p id="not-found">/not-found</p>
    </>
  )
}
