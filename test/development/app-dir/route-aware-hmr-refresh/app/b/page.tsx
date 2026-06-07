import { connection } from 'next/server'
import Link from 'next/link'

const marker = 'b-initial'

export default async function PageB() {
  await connection()

  return (
    <>
      <p id="marker">{marker}</p>
      <Link id="to-a" href="/a">
        A
      </Link>
    </>
  )
}
