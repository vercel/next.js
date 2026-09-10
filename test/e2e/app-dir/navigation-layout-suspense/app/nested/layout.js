import { Suspense } from 'react'
import Link from 'next/link'
import { connection } from 'next/server'

export default async function Layout(props) {
  await connection()
  return (
    <>
      <div>
        <Link href={`/`} className="text-blue-500">
          Home Page
        </Link>
      </div>
      <Suspense fallback={<h1>Loading...</h1>}>{props.children}</Suspense>
    </>
  )
}
