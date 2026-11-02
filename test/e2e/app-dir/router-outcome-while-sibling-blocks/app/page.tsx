import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/blocking/redirect" prefetch={false}>
        Go to redirect
      </Link>
    </>
  )
}
