import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p>
        <Link href="/client">Client</Link>
      </p>
      <p>
        <Link href="/server">Server</Link>
      </p>
    </>
  )
}
