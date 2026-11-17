import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/rsc-payload" prefetch={false} id="to-rsc-payload">
      to rsc payload
    </Link>
  )
}
