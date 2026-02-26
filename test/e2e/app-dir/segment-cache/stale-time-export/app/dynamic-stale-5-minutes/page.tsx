import Link from 'next/link'
import { connection } from 'next/server'

export const unstable_staleTime = 300 // 5 minutes

export default async function Page() {
  await connection()
  return (
    <>
      <div>Dynamic page with unstable_staleTime = 300</div>
      <Link id="back-to-home" href="/">
        Back to home
      </Link>
    </>
  )
}
