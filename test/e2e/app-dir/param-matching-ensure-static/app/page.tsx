import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/blocking/t2/navigation" prefetch={false}>
        Blocking
      </Link>
      <Link href="/closed-prefix/t1/navigation" prefetch={false}>
        Closed prefix
      </Link>
    </>
  )
}
