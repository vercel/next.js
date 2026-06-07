import { connection } from 'next/server'
import Link from 'next/link'

const marker = 'a-initial'

export default async function PageA() {
  await connection()

  return (
    <>
      <p id="marker">{marker}</p>
      <Link id="to-b" href="/b">
        B
      </Link>
    </>
  )
}
