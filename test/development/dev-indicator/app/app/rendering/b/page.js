import Link from 'next/link'
import { connection } from 'next/server'
import { setTimeout } from 'timers/promises'

export default async function Page() {
  await connection()
  await setTimeout(100)
  return (
    <>
      <Link href="/app/rendering/a" id="to-a">
        Go to a
      </Link>
    </>
  )
}
