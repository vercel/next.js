import Link from 'next/link'

export default function Navigate() {
  return (
    <>
      <Link href="/relocated" prefetch={false} id="to-relocated">
        relocated
      </Link>
      <Link href="/moved" prefetch={false} id="to-moved">
        moved
      </Link>
    </>
  )
}
