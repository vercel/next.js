import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/closed/allowed" prefetch={false}>
        Closed route
      </Link>
      <Link href="/mixed/en/allowed" prefetch={false}>
        Closed prefix, open suffix
      </Link>
    </>
  )
}
